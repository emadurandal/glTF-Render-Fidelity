'use client'; // if using Next.js App Router

import React from 'react'
import { mat4, quat, vec3 } from "gl-matrix";
import { registerBuiltInLoaders } from "@babylonjs/loaders/dynamic";
import { EquiRectangularCubeTexture, NullLoadingScreen, HDRCubeTexture, Engine, Matrix, Scene, LoadSceneAsync, FreeCamera, ArcRotateCamera, Vector3, HemisphericLight, DirectionalLight, Color3, Color4, AppendSceneAsync } from '@babylonjs/core'

export type BabylonViewerProps = {
  src?: string,
  style?: React.CSSProperties
  projection: mat4,
  view: mat4,
}

const BabylonViewer = React.forwardRef<BabylonViewerRef, BabylonViewerProps>(({ src, style, projection, view }: BabylonViewerProps, ref) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const engineRef = React.useRef<Engine | null>(null)
  const cameraRef = React.useRef<Camera | null>(null)
  const sceneRef = React.useRef<Scene | null>(null)

  React.useImperativeHandle(ref, () => ({
    doSomething: () => {
      console.log("Doing something inside BabylonViewer");
    },
    getCanvas: () => canvasRef.current,
  }));

  const getGeometricCenter = (scene) => {
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

    const engine = new Engine(canvasRef.current, true)
    engine.loadingScreen = {
      displayLoadingUI: function () {
          // Custom empty screen
      },
      hideLoadingUI: function () {
          // Do nothing
      },
      loadingUIBackgroundColor: "#000000" // Provide any default, even if unused
    };
    engineRef.current = engine

    const scene = new Scene(engine);
    scene.useRightHandedSystem = true;

    AppendSceneAsync(src, scene).then(() => {
      //scene.showloa
      // This runs after the Promise is resolved
      //const scene = new Scene(engine)
      sceneRef.current = scene
      scene.clearColor = new Color4(0.2, 0.2, 0.3, 0.5)

      // Use a FreeCamera (which accepts matrix overrides)
      const camera = new FreeCamera("camera", new Vector3(0, 0, -100), scene);
      camera.detachControl(); // Disable Babylon user controls
      camera.inputs.clear();
      cameraRef.current = camera;

      // Initialize Babylon.js
      const canvas = canvasRef.current;

      const geom_center = getGeometricCenter(scene);

      const envMapUrl = "../env_maps/qwantani_afternoon_puresky_1k.hdr";
      const hdrTexture = new EquiRectangularCubeTexture(
        envMapUrl,  // Must be a .hdr in a cube map format
        scene,
        512,  // resolution
        false, // no mipmaps
        true,  // generate HDR maps
        //false, // not gamma
        //true   // prefiltered
      );

      // Create lights
      const hemisphericLight = new HemisphericLight('light', new Vector3(0, 1, 0), scene)
      hemisphericLight.intensity = 0.7

      const directionalLight = new DirectionalLight('dirLight', new Vector3(-1, -1, -1), scene)
      directionalLight.intensity = 0.5

      // Every frame: submit matrices to Babylon
      scene.registerBeforeRender(() => {

        //const viewBabylon = Matrix.FromArray(camera_arc.getViewMatrix());
        // Convert glMatrix view matrix to Babylon's Matrix
        const viewBabylon = Matrix.FromArray(view);
        const projBabylon = Matrix.FromArray(projection);

        //setProjection(projection);
        //setView(camera_arc.getViewMatrix());

        camera.freezeProjectionMatrix(projBabylon);      // Use our custom projection
        camera.getViewMatrix = () => viewBabylon.clone(); // Override view matrix
      });

      // Render loop
      engine.runRenderLoop(() => {
        scene.render()
      })

      // Handle resize
      const handleResize = () => {
        engine.resize()
      }
      window.addEventListener('resize', handleResize)

      const resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          engine.resize()
        });
      });

      // Observe the canvas
      //resizeObserver.observe(containerRootRef.current);
      resizeObserver.observe(document.body);
      // Cleanup
      return () => {
        window.removeEventListener('resize', handleResize)
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

      camera.freezeProjectionMatrix(projBabylon);      // Use our custom projection
      camera.getViewMatrix = () => viewBabylon.clone(); // Override view matrix
    });
  }, [projection, view]);

  const envMapUrl = "../env_maps/qwantani_afternoon_puresky_1k.hdr";
  return (
    <canvas
      ref={canvasRef}
      style={style}
    />
  );
});

// types/BabylonViewerRef.ts
export interface BabylonViewerRef {
  doSomething: () => void;
  getCanvas: () => HTMLCanvasElement | null;
}

BabylonViewer.displayName = "BabylonViewer";
export default BabylonViewer;