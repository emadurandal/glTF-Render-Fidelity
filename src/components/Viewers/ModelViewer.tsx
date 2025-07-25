'use client'; // if using Next.js App Router

import React from 'react'
import { mat4, quat, vec3 } from "gl-matrix";
import { Matrix4, Vector3 } from 'three';

export type ModelViewerProps = {
  src?: string,
  style?: React.CSSProperties
  projection: mat4,
  view: mat4,
}

const ModelViewer = ({src, style, projection, view}: ModelViewerProps) => {
    const canvasRef = React.useRef(null)
    const engineRef = React.useRef(null)
    const cameraRef = React.useRef(null)
    const sceneRef = React.useRef(null)

    React.useEffect(() => {
      import('@google/model-viewer'); // Dynamically import it on the client
      
      const viewer = document.querySelector('model-viewer');
      viewer.addEventListener('load', () => {
        if (!viewer) return;

        let threeRenderer;
        let scene;
        let controls;
        for (let p = viewer; p != null; p = Object.getPrototypeOf(p)) { // Loop through toneMV object
          const privateAPI = Object.getOwnPropertySymbols(p); // Get symbols (private API)
          const renderer = privateAPI.find((value) => value.toString() == 'Symbol(renderer)'); // Find the "renderer" Symbol
          const sceneSym = privateAPI.find((value) => value.toString() == 'Symbol(scene)'); // Find the "scene" Symbol
          const controlsSym = privateAPI.find((value) => value.toString() == 'Symbol(controls)'); // Find the "scene" Symbol
          debugger;
          if (renderer != null) { // If renderer was found
            threeRenderer = viewer[renderer].threeRenderer; // set threeRenderer to the threeRenderer object
          }
          if (sceneSym != null) { // Same with scene
            scene = viewer[sceneSym];
          }
          if (controlsSym != null) { // Same with scene
            controls = viewer[controlsSym];
          }

          if (threeRenderer != null && scene != null) { // If both are found, break out of the loop, as we have what we need
            break;
          }
        }
      
        if (!scene) return;
        if (!threeRenderer) return;

        const threeCamera = scene.camera;
        //const canvas = threeRenderer.canvas;
        const canvas = threeRenderer.domElement;

        // Update custom matrices here if needed

        scene.matrixAutoUpdate = false;
        scene.matrixWorldAutoUpdate = false;

        threeCamera.matrixAutoUpdate = false;
        threeCamera.matrixWorldAutoUpdate = false;
        threeCamera.matrixWorldNeedsUpdate = false;
        threeCamera.projectionMatrixAutoUpdate = false;

        const viewIdentity = new Matrix4().fromArray(mat4.create());
        const viewThree = new Matrix4().fromArray(view);
        const projectionThree = new Matrix4().fromArray(projection);

        threeCamera.matrix.copy(viewIdentity);
        threeCamera.modelViewMatrix.copy(viewThree);
        threeCamera.matrixWorld.copy(viewThree);
        threeCamera.matrixWorldInverse.copy(viewThree);
        threeCamera.projectionMatrix.copy(projectionThree);
        threeCamera.projectionMatrixInverse.copy( threeCamera.projectionMatrix ).invert();

        scene.updateMatrixWorld(true);
        scene.forceRescale();

        threeRenderer.render(scene, threeCamera);
      });
    }, []);

    React.useEffect(() => {
      const viewer = document.querySelector('model-viewer');

      //return; 
      if (!viewer) return;

      let threeRenderer;
      let scene;
      let controls;
      for (let p = viewer; p != null; p = Object.getPrototypeOf(p)) { // Loop through toneMV object
        const privateAPI = Object.getOwnPropertySymbols(p); // Get symbols (private API)
        const renderer = privateAPI.find((value) => value.toString() == 'Symbol(renderer)'); // Find the "renderer" Symbol
        const sceneSym = privateAPI.find((value) => value.toString() == 'Symbol(scene)'); // Find the "scene" Symbol
        const controlsSym = privateAPI.find((value) => value.toString() == 'Symbol(controls)'); // Find the "scene" Symbol
        debugger;
        if (renderer != null) { // If renderer was found
          threeRenderer = viewer[renderer].threeRenderer; // set threeRenderer to the threeRenderer object
        }
        if (sceneSym != null) { // Same with scene
          scene = viewer[sceneSym];
        }
        if (controlsSym != null) { // Same with scene
          controls = viewer[controlsSym];
        }

        if (threeRenderer != null && scene != null) { // If both are found, break out of the loop, as we have what we need
          break;
        }
      }
    
      console.log("CALLED AT LEAST ONCE 2");
      console.log("scene", scene);
      console.log("threeRenderer", threeRenderer);

      if (!scene) return;
      if (!threeRenderer) return;

      const threeCamera = scene.camera;
      //const canvas = threeRenderer.canvas;
      const canvas = threeRenderer.domElement;

      // Update custom matrices here if needed

      scene.matrixAutoUpdate = false;
      scene.matrixWorldAutoUpdate = false;

      threeCamera.matrixAutoUpdate = false;
      threeCamera.matrixWorldAutoUpdate = false;
      threeCamera.matrixWorldNeedsUpdate = false;
      threeCamera.projectionMatrixAutoUpdate = false;

      const viewIdentity = new Matrix4().fromArray(mat4.create());
      const viewThree = new Matrix4().fromArray(view);
      const projectionThree = new Matrix4().fromArray(projection);

      threeCamera.matrix.copy(viewIdentity);
      threeCamera.modelViewMatrix.copy(viewThree);
      threeCamera.matrixWorld.copy(viewThree);
      threeCamera.matrixWorldInverse.copy(viewThree);
      threeCamera.projectionMatrix.copy(projectionThree);
      threeCamera.projectionMatrixInverse.copy( threeCamera.projectionMatrix ).invert();

      debugger;
      controls.jumpToGoal();

      scene.updateMatrixWorld(true);

      /*const viewMatrix = new Matrix4();
      viewMatrix.lookAt(
        new Vector3(0, 0, 5), // eye position
        new Vector3(0, 0, 0), // target
        new Vector3(0, 1, 0)  // up vector
      );
      
      // Apply to camera
      threeCamera.matrix.copy(viewMatrix.invert());
      threeCamera.matrixWorldNeedsUpdate = true;
      
      // Custom projection matrix if needed
      const projectionMatrix = new Matrix4();
      projectionMatrix.makePerspective(
        -1, 1, 1, -1, // left, right, top, bottom
        0.1, 1000     // near, far
      );*/
      //debugger; 
      //threeCamera.updateProjectionMatrix();
      //modelViewer.renderer.render(modelViewer.scene, modelViewer.camera);

      //console.log(threeRenderer);
      //console.log(camera);
      //console.log(scene);

      //debugger; 
      //viewer.render(scene, threeCamera);
      console.log("CALLED AT LEAST ONCE 1");
      scene.forceRescale();
      threeRenderer.render(scene, threeCamera);
    }, [projection, view]);

    
  const envMapUrl = "../env_maps/qwantani_afternoon_puresky_1k.hdr";
  return (
    <model-viewer
      src={src}
      camera-target="0m 0m 0m"
      interaction-prompt="none"
      style={style}
      alt="A 3D model"
    ></model-viewer>
  );
}

export default ModelViewer;