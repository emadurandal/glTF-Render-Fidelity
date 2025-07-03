'use client'; // if using Next.js App Router

import { useEffect } from 'react';
import { mat4, quat, vec3 } from "gl-matrix";
import { Matrix4, Vector3 } from 'three';

export type ModelViewerProps = {
  src: string,
  style?: React.CSSProperties
  projection: mat4,
  view: mat4,
}

const ModelViewer = ({src, style, projection, view}: ModelViewerProps) => {
    useEffect(() => {
      import('@google/model-viewer'); // Dynamically import it on the client
    }, []);

    useEffect(() => {
      const viewer = document.querySelector('model-viewer');
      console.log("Something has been updated", view);
      //return; 
      if (!viewer) return;

      let threeRenderer;
      let scene;
      let controls;
      debugger;
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
        //console.log('threeRenderer', threeRenderer);
        //console.log('scene again', scene);
        //console.log('controls', controls);
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

      const viewNew = mat4.create();
      //const projection = mat4.create();
      const eye = vec3.fromValues(0, 10, 5);
      const center = vec3.fromValues(0, 0, 0);
      const up = vec3.fromValues(0, 1, 0);
      mat4.lookAt(viewNew, eye, center, up);   // Create the view matrix
      
      const projectionMatrix = mat4.create(); // Create an identity matrix
      const fieldOfView = 45 * Math.PI / 180; // 45 degrees in radians
      const aspect = canvas.width / canvas.height;
      const near = 0.1;
      const far = 100.0;

      mat4.perspective(projectionMatrix, fieldOfView, aspect, near, far);
      const viewIdentity = new Matrix4().fromArray(mat4.create());
      //const viewThree = new Matrix4().fromArray(viewNew);
      //const projectionThree = new Matrix4().fromArray(projectionMatrix);
      const viewThree = new Matrix4().fromArray(view);
      const projectionThree = new Matrix4().fromArray(projection);
      console.log('view', view);
      console.log('projection', projection);
      console.log('viewThree', viewThree);
      console.log('projectionThree', projectionThree);

      threeCamera.matrix.copy(viewIdentity);
      threeCamera.modelViewMatrix.copy(viewThree);
      threeCamera.matrixWorld.copy(viewThree);
      threeCamera.matrixWorldInverse.copy(viewThree);
      threeCamera.projectionMatrix.copy(projectionThree);
      threeCamera.projectionMatrixInverse.copy( threeCamera.projectionMatrix ).invert();

      debugger;
      controls.jumpToGoal();

      scene.updateMatrixWorld(true);
      //threeCamera.updateMatrixWorld(true);
      //threeCamera.updateProjectionMatrix();
      //threeCamera.matrixWorldNeedsUpdate = true;

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

      console.log(threeRenderer);
      //console.log(camera);
      console.log(scene);

      debugger; 
      //viewer.render(scene, threeCamera);
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