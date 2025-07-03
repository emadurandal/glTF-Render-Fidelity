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

class ArcballCamera {
  constructor(pivot = [0, 0, 0], distance = 20) {
    this.pivot = vec3.clone(pivot);
    this.distance = distance;
    this.rotationQuat = quat.create(); // Identity rotation

    this.viewMatrix = mat4.create();

    // Mouse state
    this.lastMouse = null;

    // Sensitivity
    this.rotationSpeed = 0.01;
  }

  // Call this on mouse down
  startRotation(x, y) {
    this.lastMouse = [x, y];
  }

  getMousePositionInCanvas(event, canvas) {
    const rect = canvas.getBoundingClientRect();

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    return [x, y];
  }

  screenToArcball(x, y, width, height) {
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
  rotate(x, y, width, height) {
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
  setPivot(pivotVec3) {
    vec3.copy(this.pivot, pivotVec3);
  }

  // Change zoom
  zoom(delta) {
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
  setSliderPosition: (value: number) => void,
  sliderPosition: number
}

const Mesh3DComparisonSlider = ({imgSrc1, imgSrc2, sliderPosition, setSliderPosition}: ImageComparisonSliderProps) => {
    const imageRef = React.useRef<HTMLImageElement>(null);
    const image2Ref = React.useRef<HTMLImageElement>(null);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const containerRootRef = React.useRef<HTMLDivElement>(null);
    const camera_arc = new ArcballCamera([0, 0, 0], 3.75);

    const theme = useTheme();

    const containerCurrent = imageRef && imageRef.current;

    const elementLeft = (containerCurrent && containerCurrent.offsetLeft) || 0;
    const elementWidth = (containerCurrent && containerCurrent.clientWidth) || 1;
    const elementTop = (containerCurrent && containerCurrent.offsetTop) || 0;
    const elementHeight = (containerCurrent && containerCurrent.clientHeight) || 1;

    const projection2 = mat4.create();
    
    // Perspective projection
    const fovy = Math.PI / 4;
    const aspect = 400 / 400;
    const near = 0.1;
    const far = 1000;
    mat4.perspective(projection2, fovy, aspect, near, far);

    //setProjection(projection2);
    //setView(view2);

    const canvasRef = React.useRef<HTMLCanvasElement>(null)
    const canvas2Ref = React.useRef<HTMLCanvasElement>(null)
    const engineRef = React.useRef<Engine | null>(null)
    const sceneRef = React.useRef<Scene | null>(null)
    const [projection, setProjection] = React.useState(projection2)
    const [view, setView] = React.useState(camera_arc.getViewMatrix())
    const [error, setError] = React.useState<string | null>(null)

    const modelUrl = "../models/Duck_centered.glb";

    const toolReisze = () => {
      console.log("Ludacris")
      if(canvasRef.current == null || canvas2Ref.current == null
      || containerRef.current == null || containerRootRef.current == null) {
        console.log("Ludacris")
        return;
      }
    
      const vhToPixels = (vh: number) => (vh * window.innerHeight) / 100;

      const imageContainer = canvasRef.current;

      const maxWidth = containerRootRef.current.clientWidth ;  // Set max width
      const maxHeight = Math.max(containerRootRef.current.clientHeight, vhToPixels(70)); // Set max height
      
      const image_width = imageContainer.clientWidth;
      const image_height = imageContainer.clientHeight;
      const aspectRatio = image_height / image_width;

      // Calculate new dimensions while maintaining aspect ratio
      const width = containerRootRef.current.clientWidth;
      const height = containerRootRef.current.clientWidth * aspectRatio;

      if(width > maxWidth)
      {
        //width = maxWidth;
        //height = maxWidth / aspectRatio;
      }
      if(height > maxHeight)
      {
        //height = maxHeight;
        //width = maxHeight * aspectRatio;
      }

      containerRef.current.style.width = width+"px";
      containerRef.current.style.height = height+"px";

      canvasRef.current.style.width = width+"px";
      canvasRef.current.style.height = height+"px";

      canvas2Ref.current.style.width = width+"px";
      canvas2Ref.current.style.height = height+"px";
    }

    const getGeometricCenter = (scene) => {
        const meshes = scene.meshes.filter(mesh => mesh.isVisible && mesh.getTotalVertices() > 0);

        if (meshes.length === 0) {
            return [0, 0, 0];
        }

        let centerSum = new Vector3(0, 0, 0);

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
        engineRef.current = engine

        const scene = new Scene(engine);
        scene.useRightHandedSystem = true;
        AppendSceneAsync(modelUrl, scene).then(() => {
          // This runs after the Promise is resolved
          console.log("Done!", scene);
          console.log("Done!", scene.useRightHandedSystem);
          //const scene = new Scene(engine)
          sceneRef.current = scene
          scene.clearColor = new Color4(0.2, 0.2, 0.3, 0.5)

          scene.meshes.forEach(mesh => {
            //if (mesh.material && mesh.material.backFaceCulling !== undefined) {
            //  mesh.material.backFaceCulling = true;
            //}
          });

                  // Create camera
          /*const camera = new ArcRotateCamera(
            'camera',
            -Math.PI / 2,
            Math.PI / 2.5,
            10,
            Vector3.Zero(),
            scene
          )
          camera.attachControl(canvasRef.current, true)*/

          // Use a FreeCamera (which accepts matrix overrides)
          const camera = new FreeCamera("camera", new Vector3(0, 0, -100), scene);
          camera.detachControl(); // Disable Babylon user controls
          camera.inputs.clear();

          // Initialize Babylon.js
          const canvas = canvasRef.current;

          const geom_center = getGeometricCenter(scene);
          
          const camera_arc = new ArcballCamera([0, 0, 0], 1.75);

          setView(camera_arc.getViewMatrix());

          canvas.addEventListener('mousedown', (e) => {
            //camera_arc.startRotation(e.clientX, e.clientY);
          }, true);

          canvas.addEventListener('pointerdown', (e) => {
            const [x, y] = camera_arc.getMousePositionInCanvas(e, canvas);
            camera_arc.startRotation(x, y);
          }, true);

          canvas.addEventListener('pointermove', (e) => {
            if (e.buttons === 1) { // Left mouse button
              const [x, y] = camera_arc.getMousePositionInCanvas(e, canvas);
              camera_arc.rotate(x, y, canvas.width, canvas.height);
              setView([...camera_arc.getViewMatrix()]);
            }
          }, true);

          canvas.addEventListener('wheel', (e) => {
            camera_arc.zoom(e.deltaY * 0.01);
          }, true);

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

          const perspectiveLH = (out, fovy, aspect, near, far) => {
            const f = 1.0 / Math.tan(fovy / 2);
            const rangeInv = 1.0 / (far - near);

            out[0] = f / aspect;
            out[1] = 0;
            out[2] = 0;
            out[3] = 0;

            out[4] = 0;
            out[5] = f;
            out[6] = 0;
            out[7] = 0;

            out[8] = 0;
            out[9] = 0;
            out[10] = far * rangeInv;
            out[11] = 1;

            out[12] = 0;
            out[13] = 0;
            out[14] = -near * far * rangeInv;
            out[15] = 0;

            return out;
          }

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
              toolReisze();
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
        });;

    }, [])

    const handleDrag = (clientX : number) => {
      const container = canvasRef.current;
      if (!container) return;
  
      // Get the bounds of the container
      const rect = container.getBoundingClientRect();
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

      let length = dx * dx + dy * dy;
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
            //onMouseDown={handleMouseDown}
        //onTouchStart={handleTouchStart}
          >
            {/* Background Image */}
        {/*<canvas
          ref={canvasRef}
              style={{
              width: '100%',
              height: '100%',
            backgroundColor: "white",
              objectFit: "contain",
              position: "absolute",
              top: 0,
              //left: 0,
            }}
          onLoad={handleOnLoad}
        />*/}
    
        <BabylonViewer
          ref={canvasRef}
          src={modelUrl}
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
          onLoad={handleOnLoad}
        />

        {/* Foreground Image */}
        <ModelViewer 
          ref={canvas2Ref}
          src={modelUrl}
          projection={projection}
          view={view}
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
        />
       <Box
        sx={{
          position: "absolute",
          top: 0,
          left: `${sliderPosition}%`,
          //left: containerCurrent? `${elementLeft + sliderPosition/100 * elementWidth}px` : "50%",
          transform: "translateX(-50%)",
          width: "3px",
          height: "100%",
          backgroundColor: "gray",
          pointerEvents: "none", // Avoid slider intercepting mouse events
        }}
      />

      {/* Drag Handle */}
      <Box
        sx={{
          position: "absolute",
          top: "50%",
          //top: containerCurrent? `${elementTop + 0.5 * elementHeight}px` : "50%",
          left: `${sliderPosition}%`,
          //left: containerCurrent? `${elementLeft + sliderPosition/100 * elementWidth}px` : "50%",
          transform: "translate(-50%, -50%)",
          width: "20px",
          height: "20px",
          backgroundColor: "white",
          borderRadius: "50%",
          border: "2px solid black",
          zIndex: 11,
          pointerEvents: "none", // Avoid drag handle intercepting mouse events
        }}
      />
           

          </Box>
      </Box>
    </>);
    return 
    /*return (<>
      <canvas
          ref={canvasRef}
              style={{
              width: '100%',
              objectFit: "contain",
              position: "relative",
              top: 0,
              //left: 0,
            }}
          onLoad={handleOnLoad}
        />
    </>);*/
  };


  export default Mesh3DComparisonSlider;