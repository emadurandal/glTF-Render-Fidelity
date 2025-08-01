'use client'; // if using Next.js App Router

import React from 'react'
import { mat4, quat, vec3 } from "gl-matrix";
import { registerBuiltInLoaders } from "@babylonjs/loaders/dynamic";
import { Logger, BaseTexture, PBRMaterial, HDRCubeTexture, Engine, Matrix, Scene, Camera, LoadSceneAsync, FreeCamera, ArcRotateCamera, Vector3, HemisphericLight, DirectionalLight, Color3, Color4, AppendSceneAsync, Nullable } from '@babylonjs/core'
import { ViewerRef, BoundingBox} from '@/types/ViewerRef';

export type BabylonViewerProps = {
  src?: string,
  style?: React.CSSProperties
  projection: mat4,
  view: mat4,
  fov: number,
  aspect: number,
  setBBox: (range: BoundingBox) => void,
  finishedLoading: () => void,
}

const BabylonViewer = React.forwardRef<ViewerRef, BabylonViewerProps>(({ src, style, projection, view, aspect, fov, setBBox, finishedLoading }: BabylonViewerProps, ref) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const engineRef = React.useRef<Engine | null>(null)
  const cameraRef = React.useRef<Camera | null>(null)
  const sceneRef = React.useRef<Scene | null>(null)

  const getSceneBoundingBox = (scene: Scene) => {
    let min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    let max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

    scene.meshes.forEach(mesh => {
      if (!mesh.getBoundingInfo()) return;

      mesh.computeWorldMatrix(true); // Ensure world matrix is up to date
      const boundingInfo = mesh.getBoundingInfo();
      const boundingBox = boundingInfo.boundingBox;

      const minBox = boundingBox.minimumWorld;
      const maxBox = boundingBox.maximumWorld;

      min = Vector3.Minimize(min, minBox);
      max = Vector3.Maximize(max, maxBox);
    });

    return { min, max };
  }

  const getGeometricCenter = (scene: Scene) => {
    const meshes = scene.meshes.filter(mesh => mesh.isVisible && mesh.getTotalVertices() > 0);

    if (meshes.length === 0) {
      return [0, 0, 0];
    }

    const centerSum = new Vector3(0, 0, 0);

    meshes.forEach(mesh => {
      const boundingInfo = mesh.getBoundingInfo();
      const boundingCenter = boundingInfo.boundingBox.centerWorld;
      centerSum.addInPlace(boundingCenter);
    });

    return centerSum.scale(1 / meshes.length).asArray();
  }

  React.useEffect(() => {
    if (!canvasRef.current) return

    registerBuiltInLoaders();

    Logger.LogLevels = Logger.NoneLogLevel;

    const engine = new Engine(canvasRef.current, false)
    engine.canvasTabIndex = -1;
    canvasRef.current.style.userSelect = "none";
    canvasRef.current.style.outline = "none";
    engine.loadingScreen = {
      displayLoadingUI: function () {
          // Custom empty screen
      },
      hideLoadingUI: function () {
          // Do nothing
      },
      loadingUIText: "",
      loadingUIBackgroundColor: "#000000" // Provide any default, even if unused
    };
    engineRef.current = engine

    const scene = new Scene(engine);
    scene.useRightHandedSystem = true;

    AppendSceneAsync(src ? src : "", scene).then(async () => {
      sceneRef.current = scene

      // Use a FreeCamera (which accepts matrix overrides)
      const camera = new FreeCamera("camera", new Vector3(0, 0, -5), scene);
      camera.detachControl(); // Disable Babylon user controls
      camera.inputs.clear();
      cameraRef.current = camera;

      // Initialize Babylon.js
      const canvas = canvasRef.current;

      const geom_center = getGeometricCenter(scene);
      const bbox = getSceneBoundingBox(scene);
      const minmax = scene.getWorldExtends();

      scene.meshes.forEach(mesh => {
        const mat = mesh.material;
        if (mat && mat instanceof PBRMaterial) {
          //mat.environmentTexture = null; // Force it to use scene.environmentTexture
          //mat.reflectionTexture = null; // Force it to use scene.environmentTexture
        }
      });

      // Optional: adjust exposure and contrast
      scene.imageProcessingConfiguration.exposure = 1.5;
      scene.imageProcessingConfiguration.contrast = 1.2;

      // Every frame: submit matrices to Babylon
      scene.registerBeforeRender(() => {
          
        const viewBabylon = Matrix.FromArray(view);
        const projBabylon = Matrix.FromArray(projection);

        const extractPositionFromViewMatrix = (view: Matrix): Vector3 => {
            // Inverse view matrix gives the camera world matrix
            const inv = new Matrix();
            view.invertToRef(inv);
            return Vector3.TransformCoordinates(Vector3.Zero(), inv);
        }

        camera.freezeProjectionMatrix(projBabylon);      // Use our custom projection
        camera.getViewMatrix = () => {
          viewBabylon.clone();
          camera._computedViewMatrix = viewBabylon.clone();
          //camera._computedViewMatrix.invertToRef(camera._worldMatrix);
          return viewBabylon.clone();
        } // Override view matrix
        camera.getTransformationMatrix=  () => viewBabylon.clone()
        camera._position = extractPositionFromViewMatrix(viewBabylon);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (camera as any)._globalPosition = extractPositionFromViewMatrix(viewBabylon);
        //camera._refreshFrustumPlanes();
        //scene.setTransformMatrix(viewBabylon, projBabylon)
      });

      // Render loop
      //engine.runRenderLoop(() => {
        //scene.render()
      //})
      engine.stopRenderLoop();
      scene.render()

      // Handle resize
      /*const handleResize = () => {
        const canvas = canvasRef.current;
        engine.resize()
      }
      window.addEventListener('resize', handleResize)

      const resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          engine.resize()
        });
      });*/

      const envMapUrl = "../env_maps/chinese_garden_1k.hdr";
      const loadHDRAsync = async (url: string, scene: Scene): Promise<Nullable<BaseTexture>> => {
        return new Promise((resolve) => {
          const hdr = new HDRCubeTexture(url, scene, 512, false, true, false, true);
          hdr.onLoadObservable.addOnce(() => resolve(hdr));
        });
      }

      const reflectionTexture = await loadHDRAsync(envMapUrl, scene);
      if (!reflectionTexture) {
        finishedLoading();
        return () => {
          //window.removeEventListener('resize', handleResize)
          engine.dispose()
        }
      }
      // Apply as environment and background
      scene.environmentTexture = reflectionTexture;
      const envMapRotationY = Math.PI / 2;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (scene.environmentTexture as any).setReflectionTextureMatrix(Matrix.RotationY(envMapRotationY));

      const skybox = scene.createDefaultSkybox(reflectionTexture, true, 1000);
      // Rotate the skybox texture
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (skybox && skybox.material && (skybox.material as any).reflectionTexture) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (skybox.material as any).reflectionTexture.rotationY = envMapRotationY; // Rotate 90 degrees
      }

      // Observe the canvas
      //resizeObserver.observe(containerRootRef.current);
      //resizeObserver.observe(document.body);
      finishedLoading();
      // Cleanup
      return () => {
        //window.removeEventListener('resize', handleResize)
        engine.dispose()
      }
    });
  }, []);


  React.useEffect(() => {
    if (sceneRef.current == null) return;
    if (cameraRef.current == null) return;
    const scene = sceneRef.current;
    const camera = cameraRef.current;

    scene.onBeforeRenderObservable.clear();
    // Every frame: submit matrices to Babylon
    scene.onBeforeRenderObservable.add(() => {

      //const viewBabylon = Matrix.FromArray(camera_arc.getViewMatrix());
      // Convert glMatrix view matrix to Babylon's Matrix
      const viewBabylon = Matrix.FromArray(view);
      const projBabylon = Matrix.FromArray(projection);

      //setProjection(projection);
      //setView(camera_arc.getViewMatrix());
      const extractPositionFromViewMatrix = (view: Matrix): Vector3 => {
          // Inverse view matrix gives the camera world matrix
          const inv = new Matrix();
          view.invertToRef(inv);
          return Vector3.TransformCoordinates(Vector3.Zero(), inv);
      }

      camera.freezeProjectionMatrix(projBabylon);      // Use our custom projection
      camera.getViewMatrix = () => {
        viewBabylon.clone();
        camera._computedViewMatrix = viewBabylon.clone();
        //camera._computedViewMatrix.invertToRef(camera._worldMatrix);
        return viewBabylon.clone();
      } // Override view matrix
      camera.getTransformationMatrix=  () => viewBabylon.clone()
      camera._position = extractPositionFromViewMatrix(viewBabylon);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (camera as any)._globalPosition = extractPositionFromViewMatrix(viewBabylon);
      //camera._refreshFrustumPlanes();
      //scene.setTransformMatrix(viewBabylon, projBabylon)
    });
    scene.render();
  }, [projection, view, aspect, fov]);

  React.useImperativeHandle(ref, () => ({
    getCanvas: () => canvasRef.current,
    resize: (width: number, height: number) => {
      const canvas = canvasRef.current;
      const engine = engineRef.current;
      const scene = sceneRef.current;
      if (!canvas || !engine || !scene) return;
      engine.resize();
      scene.render();
    },
  }));

  const envMapUrl = "../env_maps/qwantani_afternoon_puresky_1k.hdr";
  return (
    <canvas
      ref={canvasRef}
      style={style}
    />
  );
});


BabylonViewer.displayName = "BabylonViewer";
export default BabylonViewer;