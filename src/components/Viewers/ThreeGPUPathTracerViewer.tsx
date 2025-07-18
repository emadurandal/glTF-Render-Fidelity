'use client'; // if using Next.js App Router

import React from 'react'
import { mat4, quat, vec3 } from "gl-matrix";
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { WebGLPathTracer } from 'three-gpu-pathtracer';

export type ThreeGPUPathTracerViewerProps = {
  src: string,
  style?: React.CSSProperties
  projection: mat4,
  view: mat4,
  fov: number,
  aspect: number
}

const ThreeGPUPathTracerViewer = ({src, style, projection, view, fov, aspect}: ThreeGPUPathTracerViewerProps) => {
    const canvasRef = React.useRef<HTMLCanvasElement>(null)
    const rendererRef = React.useRef(null)
    const rendererPtRef = React.useRef(null)
    const engineRef = React.useRef(null)
    const cameraRef = React.useRef(null)
    const sceneRef = React.useRef(null)

    React.useEffect(() => {
      const init = async () => {
        // Set up scene
        const canvas = canvasRef.current;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xffffffff);

        // Set up camera
        const camera = new THREE.PerspectiveCamera(45, 1000 / 500, 0.1, 1000);
        //const camera = new THREE.Camera();
        cameraRef.current = camera;
        //camera.position.set(0, 1.5, 5);
        camera.matrixAutoUpdate = false;
        camera.projectionMatrixAutoUpdate = false;

        const threeProjectionMatrix = new THREE.Matrix4().fromArray(projection);
        const threeViewMatrix = new THREE.Matrix4().fromArray(view);
        // Apply the matrices directly
        camera.projectionMatrix.copy(threeProjectionMatrix);
        camera.matrixWorldInverse.copy(threeViewMatrix); // View matrix
        camera.matrix.copy(threeViewMatrix.clone().invert()); // World matrix
        camera.matrixWorld.copy(camera.matrix);

        const envUrl = "../env_maps/chinese_garden_1k.hdr";
        const env_map = await new RGBELoader().loadAsync( envUrl );
        env_map.mapping = THREE.EquirectangularReflectionMapping;

        scene.background = env_map;
        scene.environment = env_map;

        // Load GLTF Model
        const gltfLoader = new GLTFLoader();
        const gltf = await gltfLoader.loadAsync(src);
        const model = gltf.scene;
        scene.add(model);

        // renderer
        const renderer = new THREE.WebGLRenderer({ 
          antialias: true, 
          alpha: false,
          canvas: canvasRef.current
        });
        renderer.setSize(canvas.clientWidth, canvas.clientHeight);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;

        // path tracer
        const pathTracer = new WebGLPathTracer( renderer );
        pathTracer.filterGlossyFactor = 0.5;
        //pathTracer.renderScale = renderScale;
        //pathTracer.tiles.set( tiles, tiles );
        //pathTracer.setBVHWorker( new ParallelMeshBVHWorker() );
        pathTracer.setScene( scene, camera );
        rendererPtRef.current = pathTracer;

        // controls
        const controls = new OrbitControls( camera, renderer.domElement );
        controls.addEventListener( 'change', () => { 
          pathTracer.updateCamera() 
        });
        controls.update();

        const animate = () => {
          requestAnimationFrame( animate );
          pathTracer.renderSample();
          controls.update();
          //renderer.render(scene, camera);
        };
        animate();

        const handleResize = () => {
          const canvas = canvasRef.current;
          renderer.setSize(canvas.clientWidth, canvas.clientHeight);
        }
        window.addEventListener('resize', handleResize)
      };
      init();
    }, []);

    React.useEffect(() => {
      const camera = cameraRef.current;
      const pathTracer = rendererPtRef.current;
      if (!camera) return;
      if (!pathTracer) return;
      
      const radiansToDegrees = (radians) => {
        return radians * (180 / Math.PI);
      }

      const threeProjectionMatrix = new THREE.Matrix4().fromArray(projection);
      const threeViewMatrix = new THREE.Matrix4().fromArray(view);
      // Apply the matrices directly
      camera.projectionMatrix.copy(threeProjectionMatrix);
      camera.matrixWorldInverse.copy(threeViewMatrix); // View matrix
      camera.matrix.copy(threeViewMatrix.clone().invert()); // World matrix
      camera.matrixWorld.copy(camera.matrix);
      camera.fov = radiansToDegrees(fov);                     // Field of view in degrees
      camera.aspect = aspect;  // New aspect ratio
      camera.updateProjectionMatrix();
      pathTracer.reset();
      pathTracer.updateCamera();
    }, [projection, view, fov, aspect]);

    return (
      <canvas
        ref={canvasRef}
        style={style}
      />
    );
}

export default ThreeGPUPathTracerViewer;