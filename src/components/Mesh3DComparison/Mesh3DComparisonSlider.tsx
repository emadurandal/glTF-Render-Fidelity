"use client"
import React from 'react'
import { Box } from "@mui/material";
import SwitchLeftIcon from '@mui/icons-material/SwitchLeft';
import SwitchRightIcon from '@mui/icons-material/SwitchRight';
import { useTheme } from '@mui/material/styles';

import { EquiRectangularCubeTexture, HDRCubeTexture, Engine, Matrix, Scene, LoadSceneAsync, FreeCamera, ArcRotateCamera, Vector3, HemisphericLight, DirectionalLight, Color3, Color4, AppendSceneAsync } from '@babylonjs/core'
//import { Engine, Matrix, Scene, LoadSceneAsync, FreeCamera, ArcRotateCamera, Vector3, HemisphericLight, DirectionalLight, Color3, Color4 } from '@babylonjs/core'
import { registerBuiltInLoaders } from "@babylonjs/loaders/dynamic";

import { mat4, quat, vec3 } from "gl-matrix";

import dynamic from 'next/dynamic';

const ModelViewer = dynamic(() => import('@/components/Viewers/ModelViewer'), { ssr: false });
const BabylonViewer = dynamic(() => import('@/components/Viewers/BabylonViewer'), { ssr: false });
const ThreeGPUPathTracerViewer = dynamic(() => import('@/components/Viewers/ThreeGPUPathTracerViewer'), { ssr: false });
const SampleViewer = dynamic(() => import('@/components/Viewers/SampleViewer'), { ssr: false });

import { BabylonViewerRef } from '@/components/Viewers/BabylonViewer';

class ArcballCamera {
  pivot: vec3; // <-- Declare it
  distance: number; // also needed if you're using `distance`
  rotationQuat: quat; // also needed if you're using `distance`
  viewMatrix: mat4; // also needed if you're using `distance`
  lastMouse: number[]; // also needed if you're using `distance`
  rotationSpeed: number; // also needed if you're using `distance`

  constructor(pivot: vec3 = [0, 0, 0], distance = 20) {
    this.pivot = vec3.clone(pivot);
    this.distance = distance;
    this.rotationQuat = quat.create(); // Identity rotation

    this.viewMatrix = mat4.create();

    // Mouse state
    this.lastMouse = [-1, -1];

    // Sensitivity
    this.rotationSpeed = 0.01;
  }

  // Call this on mouse down
  startRotation(x: number, y: number) {
    this.lastMouse = [x, y];
  }

  getMousePositionInCanvas(event: MouseEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    return [x, y];
  }

  screenToArcball(x: number, y: number, width: number, height: number) {
    let nx = (2 * x - width) / width;
    let ny = (height - 2 * y) / height;

    const lengthSq = nx * nx + ny * ny;
    let nz;

    if (lengthSq <= 1) {
      nz = Math.sqrt(1 - lengthSq);
    } else {
      // Outside of sphere, normalize to edge
      const norm = 1 / Math.sqrt(lengthSq);
      nx *= norm;
      ny *= norm;
      nz = 0;
    }

    return vec3.fromValues(nx, ny, nz);
  }

  // Call this on mouse move
  rotate(x: number, y: number, width: number, height: number) {
    if (!this.lastMouse) return;

    /*const lastPos = this.screenToArcball(this.lastMouse[0], this.lastMouse[1], width, height);
    const currPos = this.screenToArcball(x, y, width, height);
    this.lastMouse = [x, y];

    const axis = vec3.create();
    vec3.cross(axis, lastPos, currPos);

    if (vec3.length(axis) < 1e-5) return; // Ignore tiny rotations

    const dot = vec3.dot(lastPos, currPos);
    const angle = Math.acos(Math.min(1, Math.max(-1, dot))); // Clamp to avoid NaN

    const deltaQuat = quat.create();
    quat.setAxisAngle(deltaQuat, axis, angle);
    quat.normalize(deltaQuat, deltaQuat);

    quat.multiply(this.rotationQuat, deltaQuat, this.rotationQuat);*/
    if (!this.lastMouse) return;

    const dx = x - this.lastMouse[0];
    const dy = -(y - this.lastMouse[1]);
    this.lastMouse = [x, y];

    const axis = vec3.fromValues(dy, dx, 0);
    const angle = Math.sqrt(dx * dx + dy * dy) * this.rotationSpeed;

    const deltaQuat = quat.create();
    quat.setAxisAngle(deltaQuat, axis, angle);
    quat.normalize(deltaQuat, deltaQuat);

    quat.multiply(this.rotationQuat, deltaQuat, this.rotationQuat);
  }

  // Set pivot dynamically
  setPivot(pivotVec3: vec3) {
    vec3.copy(this.pivot, pivotVec3);
  }

  // Change zoom
  zoom(delta: number) {
    this.distance += delta;
    this.distance = Math.max(0.1, this.distance); // Prevent zero/negative distance
  }

  // Get view matrix
  getViewMatrix() {
    const rotationMatrix = mat4.create();
    mat4.fromQuat(rotationMatrix, this.rotationQuat);

    const cameraPos = vec3.fromValues(0, 0, this.distance);
    vec3.transformMat4(cameraPos, cameraPos, rotationMatrix);
    vec3.add(cameraPos, cameraPos, this.pivot);

    mat4.lookAt(this.viewMatrix, cameraPos, this.pivot, [0, 1, 0]);
    return this.viewMatrix;
  }
}

export type Mesh3DComparisonSliderProps = {
  imgSrc1: string,
  imgSrc2: string,
  rtEngine1: string,
  rtEngine2: string,
  src?: string,
  setSliderPosition: (value: number) => void,
  sliderPosition: number
}

const Mesh3DComparisonSlider = ({imgSrc1, imgSrc2, rtEngine1, rtEngine2, src, sliderPosition, setSliderPosition}: Mesh3DComparisonSliderProps) => {
    const imageRef = React.useRef<HTMLImageElement>(null);
    const image2Ref = React.useRef<HTMLImageElement>(null);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const containerRootRef = React.useRef<HTMLDivElement>(null);
    const camera_arc = new ArcballCamera([0, 0, 0], 5.75);

    const theme = useTheme();

    const containerCurrent = imageRef && imageRef.current;

    const elementLeft = (containerCurrent && containerCurrent.offsetLeft) || 0;
    const elementWidth = (containerCurrent && containerCurrent.clientWidth) || 1;
    const elementTop = (containerCurrent && containerCurrent.offsetTop) || 0;
    const elementHeight = (containerCurrent && containerCurrent.clientHeight) || 1;

    const projection2 = mat4.create();
    
    // Perspective projection
    const fovy = Math.PI / 4;
    const aspect2 = 400 / 400;
    const near = 0.1;
    const far = 1000;
    mat4.perspective(projection2, fovy, aspect2, near, far);

    //const canvasRef = React.useRef<HTMLCanvasElement>(null)
    const sliderRef = React.useRef(null);
    const sliderDragRef = React.useRef(false);
    const canvasRef = React.useRef<BabylonViewerRef>(null);
    const canvas2Ref = React.useRef<HTMLCanvasElement>(null)
    const engineRef = React.useRef<Engine | null>(null)
    const sceneRef = React.useRef<Scene | null>(null)
    const [fov, setFov] = React.useState(Math.PI / 4)
    const [aspect, setAspect] = React.useState(1)
    const [projection, setProjection] = React.useState(projection2)
    const [view, setView] = React.useState(camera_arc.getViewMatrix())
    const [error, setError] = React.useState<string | null>(null)
    const [sliderDrag, setSliderDrag] = React.useState<boolean>(false)

    const modelUrl = "../models/Duck_centered.glb";

    const toolReisze = () => {
      if(canvasRef.current == null /*|| canvas2Ref.current == null*/
        || imageRef.current == null
        || containerRef.current == null || containerRootRef.current == null) {
        return;
      }
    
      const vhToPixels = (vh: number) => (vh * window.innerHeight) / 100;

      const imageContainer = imageRef.current;
      const canvasContainer = canvasRef.current.getCanvas();

      const maxWidth = containerRootRef.current.clientWidth ;  // Set max width
      const maxHeight = Math.max(containerRootRef.current.clientHeight, vhToPixels(70)); // Set max height
      
      const image_width = imageContainer.naturalWidth;
      const image_height = imageContainer.naturalHeight;
      const aspectRatio = image_height / image_width;

      // Calculate new dimensions while maintaining aspect ratio
      const width = containerRootRef.current.clientWidth;
      const height = containerRootRef.current.clientWidth * aspectRatio;
      console.log("Dimensions", width, height);
      console.log("Dimensions", imageContainer.clientWidth, imageContainer.clientHeight);
      
      containerRef.current.style.width = width+"px";
      containerRef.current.style.height = height+"px";

      const canvas = canvasRef.current.getCanvas();
      if(!canvas) return;
      
      canvas.style.width = width+"px";
      canvas.style.height = height+"px";

      //canvas2Ref.current.style.width = width+"px";
      //canvas2Ref.current.style.height = height+"px";
    }

    const getGeometricCenter = (scene: number) => {
        /*const meshes = scene.meshes.filter(mesh => mesh.isVisible && mesh.getTotalVertices() > 0);

        if (meshes.length === 0) {
            return [0, 0, 0];
        }

        const centerSum = new Vector3(0, 0, 0);

        meshes.forEach(mesh => {
            const boundingInfo = mesh.getBoundingInfo();
            const boundingCenter = boundingInfo.boundingBox.centerWorld;
            centerSum.addInPlace(boundingCenter);
        });

        return centerSum.scale(1 / meshes.length).asArray();*/
        return 1;
    }


    const isInside = (e:MouseEvent, r:DOMRect, m:number ) => {
      return e.clientX >= (r.left - m) && e.clientX <= (r.right + m) &&
      e.clientY >= (r.top + m) && e.clientY <= (r.bottom - m);
    };

    React.useEffect(() => {
      const container = canvasRef.current;
      if (containerRootRef.current === null) return;
      /*containerRootRef.current.addEventListener('mousedown', (e) => {
        const slider = sliderRef.current;
        const rect = slider.getBoundingClientRect();
        sliderDragRef.current = isInside(e, rect, 10);
        console.log("isInside(e, rect)", isInside(e, rect, 10));
        if (!sliderDragRef.current)
          camera_arc.startRotation(e.clientX, e.clientY);
      }, true);*/

      containerRootRef.current.addEventListener('pointerdown', (e) => {
      if (sliderRef.current === null) return;
        const slider = sliderRef.current;
        const rect = slider.getBoundingClientRect();
        sliderDragRef.current = isInside(e, rect, 10);
        console.log("isInside(e, rect)", isInside(e, rect, 10));
        if (sliderDragRef.current) return;

        const canvas = canvasRef.current.getCanvas();
        const [x, y] = camera_arc.getMousePositionInCanvas(e, canvas);

        camera_arc.startRotation(e.clientX, e.clientY);
      }, true);

      containerRootRef.current.addEventListener('pointermove', (e) => {
        if (e.buttons === 1) { // Left mouse button
          const slider = sliderRef.current;
          const rect = slider.getBoundingClientRect();

          if (sliderDragRef.current) return;

          const canvas = canvasRef.current.getCanvas();
          const [x, y] = camera_arc.getMousePositionInCanvas(e, canvas);
          camera_arc.rotate(x, y, canvas.width, canvas.height);
          setView([...camera_arc.getViewMatrix()]);
        }
      }, true);

      containerRootRef.current.addEventListener('wheel', (e) => {
        e.preventDefault();
        camera_arc.zoom(e.deltaY * 0.01);
        setView([...camera_arc.getViewMatrix()]);
      }, true);

      const fovy = Math.PI / 4;
      const aspect = containerRootRef.current.clientWidth / containerRootRef.current.clientHeight;
      const near = 0.1;
      const far = 1000;
      console.log("containerRootRef.current.clientWidth / containerRootRef.current.clientHeight", containerRootRef.current.clientWidth, containerRootRef.current.clientHeight);
      mat4.perspective(projection2, fovy, aspect, near, far);
      setProjection(projection2);

      setFov(Math.PI / 4);
      setAspect(containerRootRef.current.clientWidth / containerRootRef.current.clientHeight);
    
      const resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          toolReisze();
        });
      });
      // Observe the canvas
      //resizeObserver.observe(containerRootRef.current);
      resizeObserver.observe(document.body);
    }, [])

    const handleDrag = (clientX : number) => {
      if (!sliderDragRef.current) return;
      const container = canvasRef.current;
      if (!container) return;
      const canvas = container.getCanvas();
      
      // Get the bounds of the container
      const rect = canvas.getBoundingClientRect();
      const offsetX = clientX - rect.left; // Mouse position relative to the container
      const newSliderPosition = (offsetX / rect.width) * 100;
      
      // Clamp the value between 0 and 100
      if (newSliderPosition >= 0 && newSliderPosition <= 100) {
        setSliderPosition(newSliderPosition);
      }
    };
  
    const projectToSphere = (x, y, width, height) => {
      const radius = Math.min(width, height) / 2;
      const cx = width / 2;
      const cy = height / 2;

      // Normalize coordinates to [-1, 1]
      let dx = (x - cx) / radius;
      let dy = (cy - y) / radius; // Invert Y for screen-space

      const length = dx * dx + dy * dy;
      let dz = 0;
      if (length <= 1.0) {
        dz = Math.sqrt(1.0 - length);
      } else {
        const norm = 1 / Math.sqrt(length);
        dx *= norm;
        dy *= norm;
      }

      return vec3.fromValues(dx, dy, dz);
    }

    const handleMouseDown = (event: React.MouseEvent) => {
      event.preventDefault();
      const onMouseMove = (e: MouseEvent) => handleDrag(e.clientX);
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", () => {
        document.removeEventListener("mousemove", onMouseMove);
      });
    };
    const handleTouchStart = (event: React.TouchEvent | TouchEvent) => {
        event.preventDefault();
        const onTouchMove = (e: TouchEvent) => {
            if (e.touches && e.touches[0]) {
              handleDrag(e.touches[0].clientX);
            }
        };
        document.addEventListener("touchmove", onTouchMove);
        document.addEventListener("touchend", () => {
          document.removeEventListener("touchmove", onTouchMove);
        });
    };

    const handleOnLoad = () => {
      const resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          toolReisze();
        });
      });

      // Observe the canvas
      //resizeObserver.observe(containerRootRef.current);
      resizeObserver.observe(document.body);
    }

    return (<>
      <Box 
            display='flex'
            justifyContent='center'
            ref={containerRootRef} 
            sx={{
              width: "100%",        
              height: "500px",
              overflow: "hidden",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
          <Box
            display='flex'
            justifyContent='center'
            ref={containerRef}
            sx={{
              position: "relative",
              width: "100%",        
              overflow: "hidden",
              cursor: "pointer",
              userSelect: "none",
              //maxWidth: '70vh',
              //maxHeight: '70vh',
              touchAction:'none'
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
          >
            {/* Background Image */}
        {/* Background Image */}
        <img
          ref={imageRef}
          src={imgSrc2}
          alt="Background"
          style={{
            width: '100%',
            objectFit: "contain",
            position: "absolute",
            display: "none",
            top: 0,
            //left: 0,
          }}
          onLoad={handleOnLoad}
        />

        <BabylonViewer
          ref={canvasRef}
          src={src}
          projection={projection}
          view={view}
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: "white",
            objectFit: "contain",
            position: "absolute",
            top: 0,
            //left: 0,
          }}
        />

        {/* Foreground Image */}
        
        {rtEngine1==="three-gpu-pathtracer" && <ThreeGPUPathTracerViewer 
          src={src}
          projection={projection}
          view={view}
          fov={fov}
          aspect={aspect}
          style={{
            width: '100%',
            height: '100%',
            objectFit: "contain",
            position: "absolute",
            top: 0,
            //left: 0,
            backgroundColor: "white",
            clipPath: `inset(0 ${100 - sliderPosition}% 0 0)`, // Adjust visible area
          }}
        />}

        {rtEngine1==="gltf-sample-viewer" && <SampleViewer 
          src={src}
          projection={projection}
          view={view}
          fov={fov}
          aspect={aspect}
          style={{
            width: '100%',
            height: '100%',
            objectFit: "contain",
            position: "absolute",
            top: 0,
            //left: 0,
            backgroundColor: "white",
            clipPath: `inset(0 ${100 - sliderPosition}% 0 0)`, // Adjust visible area
          }}
        />}
       <Box
        ref={sliderRef}
        sx={{
          position: "absolute",
          top: 0,
          left: `${sliderPosition}%`,
          //left: containerCurrent? `${elementLeft + sliderPosition/100 * elementWidth}px` : "50%",
          transform: "translateX(-50%)",
          width: "3px",
          height: "100%",
          backgroundColor: "gray",
          //pointerEvents: "none", // Avoid slider intercepting mouse events
        }}
      />

      {/* Drag Handle */}
      <Box
        sx={{
          position: "absolute",
          top: "50%",
          left: `${sliderPosition}%`,
          transform: "translate(-50%, -50%)",
          width: "20px",
          height: "20px",
          backgroundColor: "white",
          borderRadius: "50%",
          border: "2px solid black",
          zIndex: 11,
          //pointerEvents: "none", // Avoid drag handle intercepting mouse events
        }}
      />
           

          </Box>
      </Box>
    </>);
  };


  export default Mesh3DComparisonSlider;