"use client"
import React from 'react'
import { Box } from "@mui/material";
import SwitchLeftIcon from '@mui/icons-material/SwitchLeft';
import SwitchRightIcon from '@mui/icons-material/SwitchRight';
import { useTheme } from '@mui/material/styles';
import * as THREE from 'three';
import { EquiRectangularCubeTexture, HDRCubeTexture, Engine, Matrix, Scene, LoadSceneAsync, FreeCamera, ArcRotateCamera, Vector3, HemisphericLight, DirectionalLight, Color3, Color4, AppendSceneAsync } from '@babylonjs/core'
//import { Engine, Matrix, Scene, LoadSceneAsync, FreeCamera, ArcRotateCamera, Vector3, HemisphericLight, DirectionalLight, Color3, Color4 } from '@babylonjs/core'
import { registerBuiltInLoaders } from "@babylonjs/loaders/dynamic";
import {  } from '@/components/Viewers/ViewerRef';
import { ViewerRef, BoundingBox } from '@/components/Viewers/ViewerRef';
import { mat4, quat, vec3 } from "gl-matrix";

import dynamic from 'next/dynamic';

const ModelViewer = dynamic(() => import('@/components/Viewers/ModelViewer'), { ssr: false });
const BabylonViewer = dynamic(() => import('@/components/Viewers/BabylonViewer'), { ssr: false });
const ThreeGPUPathTracerViewer = dynamic(() => import('@/components/Viewers/ThreeGPUPathTracerViewer'), { ssr: false });
const SampleViewer = dynamic(() => import('@/components/Viewers/SampleViewer'), { ssr: false });

class ArcballCamera {
  pivot: vec3; // <-- Declare it
  distance: number; // also needed if you're using `distance`
  rotationQuat: quat; // also needed if you're using `distance`
  viewMatrix: mat4; // also needed if you're using `distance`
  lastMouse: number[]; // also needed if you're using `distance`
  rotationSpeed: number; // also needed if you're using `distance`

  // === Camera orbit state ===
  target: THREE.Vector3 = new THREE.Vector3(0, 0, 0); // Point to orbit around
  radius: number = 5;
  theta: number = 0;
  phi: number = Math.PI / 2;

  isDragging: boolean = false;

  threeCamera: THREE.PerspectiveCamera = new THREE.PerspectiveCamera();

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
  
  onMouseDown(event) {
    this.isDragging = true;
    this.lastMouse.x = event.clientX;
    this.lastMouse.y = event.clientY;
  }

  // === Update camera position based on spherical coords ===
  updateCameraPosition() {
    const x = this.radius * Math.sin(this.phi) * Math.sin(this.theta);
    const y = this.radius * Math.cos(this.phi);
    const z = this.radius * Math.sin(this.phi) * Math.cos(this.theta);

    this.threeCamera.position.set(x, y, z);
    this.threeCamera.lookAt(this.target);

    // If you're sending matrices elsewhere:
    this.threeCamera.updateMatrix();
    this.threeCamera.updateMatrixWorld();
    this.threeCamera.updateProjectionMatrix();
  }

  updateAspectRatio(ar: number) {
    this.threeCamera.aspect = ar;
    this.threeCamera.updateProjectionMatrix();
  }

  onMouseWheel(event) {
    event.preventDefault();

    // Adjust radius with a zoom factor
    const zoomSpeed = 0.2;
    this.radius += event.deltaY * zoomSpeed * 0.01;

    // Clamp to prevent flipping or going too close
    this.radius = Math.max(0.1, Math.min(100.0, this.radius));

    this.updateCameraPosition();
  }

  onMouseMove(event) {
      if (!this.isDragging) return;

      const dx = event.clientX - this.lastMouse.x;
      const dy = event.clientY - this.lastMouse.y;

      // Sensitivity factor
      this.theta -= dx * 0.005;
      this.phi -= dy * 0.005;

      // Clamp phi to avoid upside-down camera
      const epsilon = 0.01;
      this.phi = Math.max(epsilon, Math.min(Math.PI - epsilon, this.phi));

      this.lastMouse.x = event.clientX;
      this.lastMouse.y = event.clientY;

      this.updateCameraPosition();
      console.log("THIS RADIUS", this.radius);

  }

  onMouseUp() {
    this.isDragging = false;
  }

  // Set pivot dynamically
  setRadius(newRadius: number) {
    this.radius = newRadius;

    this.updateCameraPosition();
  }

  // Set pivot dynamically
  setPivot(newRadius: number) {
    this.radius = newRadius;

    this.updateCameraPosition();
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
    const threeCameraRef = React.useRef<THREE.PerspectiveCamera>(null);
    const cameraRef = React.useRef<ArcballCamera>(null);
    const imageRef = React.useRef<HTMLImageElement>(null);
    const image2Ref = React.useRef<HTMLImageElement>(null);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const containerRootRef = React.useRef<HTMLDivElement>(null);
    
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
    const canvasRef = React.useRef<ViewerRef>(null);
    const canvas2Ref = React.useRef<ViewerRef>(null)
    const engineRef = React.useRef<Engine | null>(null)
    const sceneRef = React.useRef<Scene | null>(null)
    const [fov, setFov] = React .useState(Math.PI / 4)
    const [aspect, setAspect] = React.useState(1)
    const [projection, setProjection] = React.useState(projection2)
    const [view, setView] = React.useState(mat4.create())
    const [extents, setExtents] = React.useState<BoundingBox>({min: new Float32Array(3), max: new Float32Array(3)})
    const [error, setError] = React.useState<string | null>(null)
    const [sliderDrag, setSliderDrag] = React.useState<boolean>(false)

    const finishedLoading = () => {
      if (!cameraRef.current) return;
      const cam = cameraRef.current;
    
      // Projection matrix (Perspective or Orthographic)
      const projectionMatrix = cam.threeCamera.projectionMatrix.clone(); // THREE.Matrix4

      // View matrix (inverse of world matrix)
      const viewMatrix = new THREE.Matrix4().copy(cam.threeCamera.matrixWorld).invert();

      const projectionArray = projectionMatrix.toArray();
      const viewArray = viewMatrix.toArray();

      setView(viewArray);
      setProjection(projectionArray);
    }

    const setBoundingBox = (b: BoundingBox) => {
      const cam = cameraRef.current;
      //const canvas = canvasRef.current.getCanvas();
      //const canvas2 = canvas2Ref.current.getCanvas();

      const boxMax = vec3.fromValues(b.max[0], b.max[1], b.max[2]);
      const boxMin = vec3.fromValues(b.min[0], b.min[1], b.min[2]);

      const diag = vec3.create();
      const center = vec3.create();
      vec3.add(center, boxMax, boxMin);
      vec3.scale(center, center, 0.5);
      vec3.sub(diag, boxMax, boxMin);
      const radius = vec3.length(diag);
      cam.setRadius(radius * 2);

      // Projection matrix (Perspective or Orthographic)
      const projectionMatrix = cam.threeCamera.projectionMatrix.clone(); // THREE.Matrix4

      // View matrix (inverse of world matrix)
      const viewMatrix = new THREE.Matrix4().copy(cam.threeCamera.matrixWorld).invert();

      const projectionArray = projectionMatrix.toArray();
      const viewArray = viewMatrix.toArray();

      setView(viewArray);
      setProjection(projectionArray);
      setExtents(b);

    };

    const toolReisze = () => {
      if(canvasRef.current == null || canvas2Ref.current == null
        || containerRef.current == null || containerRootRef.current == null) {
        return;
      }
    
      const canvas = canvasRef.current.getCanvas();
      const canvas2 = canvas2Ref.current.getCanvas();

      //console.log("canvasRef.current", canvasRef.current);
      //console.log("canvas2Ref.current", canvas2Ref.current);
      if (canvas === null || canvas2 == null) return

      //const image_width = canvasContainer.width;
      //const image_height = canvasContainer.height;
      //const aspectRatio = image_height / image_width;

      // Calculate new dimensions while maintaining aspect ratio
      const width = containerRootRef.current.clientWidth;
      const height = containerRootRef.current.clientHeight;

      //const width = canvas.clientWidth;
      //const height = canvas.clientHeight;

      containerRef.current.style.width = width+"px";
      containerRef.current.style.height = height+"px";
      
      canvas.style.width = width+"px";
      canvas.style.height = height+"px";

      canvas2.style.width = width+"px";
      canvas2.style.height = height+"px";

      canvasRef.current.resize(width, height);
      canvas2Ref.current.resize(width, height);

      const camera = cameraRef.current;
      if(!camera) return;

      camera.updateAspectRatio(width / height);
      const projectionMatrix = camera.threeCamera.projectionMatrix.clone(); // THREE.Matrix4
      const projectionArray = projectionMatrix.toArray();

      setProjection(projectionArray);
      setAspect(width / height);
    }

    const isInside = (e:MouseEvent, r:DOMRect, m:number ) => {
      return e.clientX >= (r.left - m) && e.clientX <= (r.right + m) &&
      e.clientY >= (r.top + m) && e.clientY <= (r.bottom - m);
    };

    React.useEffect(() => {
      console.log("BBOXING", extents);
    }, [extents])

    React.useEffect(() => {
      const camera_arc = new ArcballCamera([0, 0, 0], 5.75);
      cameraRef.current = camera_arc;
    
      const container = canvasRef.current;
      if (containerRootRef.current === null) return;

      containerRootRef.current.addEventListener('pointerdown', (e) => {
        if (sliderRef.current === null) return;

        const slider = sliderRef.current;
        const rect = slider.getBoundingClientRect();
        sliderDragRef.current = isInside(e, rect, 10);

        if (sliderDragRef.current) return;

        const canvas = canvasRef.current.getCanvas();
        const [x, y] = camera_arc.getMousePositionInCanvas(e, canvas);

        //camera_arc.startRotation(e.clientX, e.clientY);
        camera_arc.onMouseDown(e);

        // Projection matrix (Perspective or Orthographic)
        const projectionMatrix = camera_arc.threeCamera.projectionMatrix.clone(); // THREE.Matrix4

        // View matrix (inverse of world matrix)
        const viewMatrix = new THREE.Matrix4().copy(camera_arc.threeCamera.matrixWorld).invert();

        const projectionArray = projectionMatrix.toArray();
        const viewArray = viewMatrix.toArray();

        setView(viewArray);
        setProjection(projectionArray);

      }, true);

      containerRootRef.current.addEventListener('pointermove', (e) => {
        if (e.buttons === 1) { // Left mouse button
          const slider = sliderRef.current;
          const rect = slider.getBoundingClientRect();

          if (sliderDragRef.current) return;

          const canvas = canvasRef.current.getCanvas();
          const [x, y] = camera_arc.getMousePositionInCanvas(e, canvas);
          //camera_arc.rotate(x, y, canvas.width, canvas.height);
          
          camera_arc.onMouseMove(e);

          // Projection matrix (Perspective or Orthographic)
          const projectionMatrix = camera_arc.threeCamera.projectionMatrix.clone(); // THREE.Matrix4

          // View matrix (inverse of world matrix)
          const viewMatrix = new THREE.Matrix4().copy(camera_arc.threeCamera.matrixWorld).invert();

          const projectionArray = projectionMatrix.toArray();
          const viewArray = viewMatrix.toArray();

          setView(viewArray);
          setProjection(projectionArray);
          //setView([...camera_arc.getViewMatrix()]);
        }
      }, true);

      containerRootRef.current.addEventListener('wheel', (e) => {
        e.preventDefault();
        camera_arc.onMouseWheel(e);
        // View matrix (inverse of world matrix)
        const viewMatrix = new THREE.Matrix4().copy(camera_arc.threeCamera.matrixWorld).invert();

        const viewArray = viewMatrix.toArray();

        setView(viewArray);
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
          
      const fovThree = 45;
      const aspectThree  = window.innerWidth / window.innerHeight;
      const nearThree  = 0.1;
      const farThree  = 1000;

      const cameraThree = new THREE.PerspectiveCamera(fovThree, aspect, near, far);
      
      // Optional: set initial position and rotation
      cameraThree.position.set(0, 0, 2);
      cameraThree.lookAt(new THREE.Vector3(0, 0, 0));
      cameraThree.updateMatrix();       // Update local matrix
      cameraThree.updateMatrixWorld(); // Update world matrix
      cameraThree.updateProjectionMatrix(); // 
      
      // Projection matrix (Perspective or Orthographic)
      const projectionMatrix = cameraThree.projectionMatrix.clone(); // THREE.Matrix4

      // View matrix (inverse of world matrix)
      const viewMatrix = new THREE.Matrix4().copy(cameraThree.matrixWorld).invert();

      const projectionArray = projectionMatrix.toArray();
      const viewArray = viewMatrix.toArray();

      setView(viewArray);
      setProjection(projectionArray);

      // Or, use:
      const viewMatrixAlt = cameraThree.matrixWorldInverse.clone();
      threeCameraRef.current = cameraThree;
      camera_arc.threeCamera = cameraThree;

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
              touchAction:'none'
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
          >

        {/* Background Image */}
        {rtEngine2==="three-gpu-pathtracer" && <ThreeGPUPathTracerViewer 
          ref={canvasRef}
          src={src}
          projection={projection}
          view={view}
          fov={fov}
          aspect={aspect}
          setBBox={setBoundingBox}
          finishedLoading={finishedLoading}
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: "white",
            objectFit: "contain",
            position: "absolute",
            top: 0,
            //left: 0,
          }}
        />}

        {rtEngine2==="gltf-sample-viewer" && <SampleViewer 
          ref={canvasRef}
          src={src}
          projection={projection}
          view={view}
          fov={fov}
          aspect={aspect}
          setBBox={setBoundingBox}
          finishedLoading={finishedLoading}
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: "white",
            objectFit: "contain",
            position: "absolute",
            top: 0,
            //left: 0,
          }}
        />}
        {rtEngine2==="babylon.js" && <BabylonViewer 
          ref={canvasRef}
          src={src}
          projection={projection}
          view={view}
          fov={fov}
          aspect={aspect}
          setBBox={setBoundingBox}
          finishedLoading={finishedLoading}
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: "white",
            objectFit: "contain",
            position: "absolute",
            top: 0,
            //left: 0,
          }}
        />}
        {rtEngine2==="model-viewer" && <ModelViewer 
          ref={canvasRef}
          src={src}
          projection={projection}
          view={view}
          fov={fov}
          aspect={aspect}
          setBBox={setBoundingBox}
          finishedLoading={finishedLoading}
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: "white",
            objectFit: "contain",
            position: "absolute",
            top: 0,
            //left: 0,
          }}
        />}

        {/* Foreground Image */}

        {rtEngine1==="three-gpu-pathtracer" && <ThreeGPUPathTracerViewer 
          ref={canvas2Ref}
          src={src}
          projection={projection}
          view={view}
          fov={fov}
          aspect={aspect}
          setBBox={setBoundingBox}
          finishedLoading={finishedLoading}
          style={{
            width: '100%',
            height: '100%',
            objectFit: "contain",
            position: "absolute",
            top: 0,
            //left: 0,
            userSelect: "none",
            outline: "none",
            backgroundColor: "white",
            clipPath: `inset(0 ${100 - sliderPosition}% 0 0)`, // Adjust visible area
          }}
        />}

        {rtEngine1==="gltf-sample-viewer" && <SampleViewer 
          ref={canvas2Ref}
          src={src}
          projection={projection}
          view={view}
          fov={fov}
          aspect={aspect}
          setBBox={setBoundingBox}
          finishedLoading={finishedLoading}
          style={{
            width: '100%',
            height: '100%',
            objectFit: "contain",
            position: "absolute",
            top: 0,
            //left: 0,
            userSelect: "none",
            outline: "none",
            backgroundColor: "white",
            clipPath: `inset(0 ${100 - sliderPosition}% 0 0)`, // Adjust visible area
          }}
        />}
        {rtEngine1==="babylon.js" && <BabylonViewer 
          ref={canvas2Ref}
          src={src}
          projection={projection}
          view={view}
          fov={fov}
          aspect={aspect}
          setBBox={setBoundingBox}
          finishedLoading={finishedLoading}
          style={{
            width: '100%',
            height: '100%',
            objectFit: "contain",
            position: "absolute",
            top: 0,
            //left: 0,
            userSelect: "none",
            outline: "none",
            backgroundColor: "white",
            clipPath: `inset(0 ${100 - sliderPosition}% 0 0)`, // Adjust visible area
          }}
        />}
        {rtEngine1==="model-viewer" && <ModelViewer 
          ref={canvas2Ref}
          src={src}
          projection={projection}
          view={view}
          fov={fov}
          aspect={aspect}
          setBBox={setBoundingBox}
          finishedLoading={finishedLoading}
          style={{
            width: '100%',
            height: '100%',
            objectFit: "contain",
            position: "absolute",
            top: 0,
            //left: 0,
            userSelect: "none",
            outline: "none",
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