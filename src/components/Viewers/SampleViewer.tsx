'use client'; // if using Next.js App Router

import React from 'react'
import { mat4, quat, vec3 } from "gl-matrix";
import Script from "next/script";

export type SampleViewerProps = {
  src?: string,
  style?: React.CSSProperties
  projection: mat4,
  view: mat4,
  fov: number,
  aspect: number
}

const SampleViewer = ({src, style, projection, view, fov, aspect}: SampleViewerProps) => {
    const canvasRef = React.useRef<HTMLCanvasElement>(null)
    const rendererRef = React.useRef(null)
    const rendererPtRef = React.useRef(null)
    const engineRef = React.useRef(null)
    const cameraRef = React.useRef<UserCamera>(null)
    const sceneRef = React.useRef(null)

    const [ktxLoaded, setKTXLoaded] = React.useState(false);
    const [dracoLoaded, setDracoLoaded] = React.useState(false);

    React.useEffect(() => {
      console.warn("MOUNT");
      const isDracoLoaded = !!document.querySelector('script[src="https://www.gstatic.com/draco/v1/decoders/draco_decoder_gltf.js"]')
      const isKTXLoaded = !!document.querySelector('script[src="/libs/libktx.js"]')
      setKTXLoaded(isKTXLoaded);
      setDracoLoaded(isDracoLoaded);
 
      return () => { console.warn("Unmount")};
    }, [])

    React.useEffect(() => {
      if((ktxLoaded && dracoLoaded) == false)
        return;
      if(canvasRef == null || canvasRef.current == null) { return; }
      const canvas = canvasRef.current;
      const webGl2Context = canvas.getContext('webgl2') as WebGL2RenderingContext;
      //webGl2Context.clearColor(1,0,0,1);
      //webGl2Context.clear(webGl2Context.COLOR_BUFFER_BIT);
  
      const load = async () => {
        const {GltfView, GltfState} = await import('@khronosgroup/gltf-viewer/dist/gltf-viewer.module.js');
        const gltfView = new GltfView(webGl2Context);
        const state = gltfView.createState();
        cameraRef.current = state.userCamera;
        state.sceneIndex = 0;
        state.animationIndices = [0, 1, 2];
        state.animationTimer.start();
  
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;

        const resourceLoader = gltfView.createResourceLoader();
        state.gltf = await resourceLoader.loadGltf(src);
  
            
        resourceLoader.loadEnvironment("/assets/chinese_garden_1k.hdr", {
          lut_ggx_file: "/assets/lut_ggx.png",
          lut_charlie_file: "/assets/lut_charlie.png",
          lut_sheen_E_file: "/assets/lut_sheen_E.png"
        }).then((environment) => {
          state.environment = environment;
        })
        const scene = state.gltf.scenes[state.sceneIndex];
        scene.applyTransformHierarchy(state.gltf);
        state.userCamera.perspective.aspectRatio = canvas.clientWidth / canvas.clientHeight;
        state.userCamera.resetView(state.gltf, state.sceneIndex);
        //state.userCamera.fitViewToScene(state.gltf, state.sceneIndex);
        //state.userCamera.orbitSpeed = Math.max(10.0 / canvas.width, 10.0 / canvas.height);
        console.log("state.userCamera", state.userCamera);
        console.log(typeof state.userCamera);
        console.log(typeof state.userCamera);
        console.log(state.userCamera.constructor.name);
        console.log(state.userCamera.getViewMatrix);
        state.userCamera.getViewMatrix = function () {
          return view;
        };
        console.log(canvas.width, canvas.height);
        console.log(canvas.clientWidth, canvas.clientHeight);

        const update = () =>
        { 
          const canvas = canvasRef.current;
          console.log(canvas.clientWidth, canvas.clientHeight);

          state.userCamera.resetView(state.gltf, state.sceneIndex);
          state.userCamera.fitViewToScene(state.gltf, state.sceneIndex);
          gltfView.renderFrame(state, canvas.clientWidth, canvas.clientHeight);
          window.requestAnimationFrame(update);
        };
        window.requestAnimationFrame(update);

        const handleResize = () => {
          const canvas = canvasRef.current;
          canvas.width = canvas.clientWidth;
          //canvas.height = canvas.clientHeight;

          //renderer.setSize(canvas.clientWidth, canvas.clientHeight);
          //console.log("RESIZING FROM DEEP INSIDE GPU PATH TRACER")
          console.log("RESIZING FROM DEEP INSIDE GPU PATH TRACER", canvas.clientWidth, canvas.clientHeight)
        }
        window.addEventListener('resize', handleResize)
      };
      load();
    }, [src, ktxLoaded, dracoLoaded])

    React.useEffect(() => {
      if (cameraRef.current === null) return;
      cameraRef.current.getViewMatrix = function () {
        return view;
      };
    }, [projection, view, fov, aspect]);

    return (
      <>
        <Script src="https://www.gstatic.com/draco/v1/decoders/draco_decoder_gltf.js" strategy="lazyOnload" onLoad={() => { console.log("LOADEDDDDDDDD Draco"); setDracoLoaded(true);}} />
        <Script src="/libs/libktx.js" strategy="lazyOnload" onLoad={() => { console.log("LOADEDDDDDDDD KTX"); setKTXLoaded(true); }}/>
        <canvas
          ref={canvasRef}
          style={style}
        />
      </>
    );
}

export default SampleViewer;