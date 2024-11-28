
import {css, customElement, html, LitElement, property} from 'lit-element';

// @ts-ignore
import Rn from '../../../node_modules/rhodonite/dist/esmdev/index.js';
import {ScenarioConfig} from '../../common.js';

const $isRhodoniteInitDone = Symbol('isRhodoniteInitDone');
const $updateSize = Symbol('updateSize');
const $updateScenario = Symbol('updateScenario');
const $canvas = Symbol('canvas');

@customElement('rhodonite-viewer')
export class RhodoniteViewer extends LitElement {
  @property({type: Object}) scenario: ScenarioConfig|null = null;
  private[$canvas]: HTMLCanvasElement|null = null;
  private[$isRhodoniteInitDone] = false;

  static get styles() {
    return css`
  :host {
    display: block;
  }
  `;
  }

  render() {
    return html`<canvas id="canvas"></canvas>`;
  }

  updated(changedProperties: Map<string, any>) {
    super.updated(changedProperties);
    this[$updateSize]();

    if (changedProperties.has('scenario') && this.scenario != null) {
      this[$updateScenario](this.scenario);
    }
  }

  private async[$updateScenario](scenario: ScenarioConfig) {
    // Rhodonite Initialization
    await this.initRhodonite();

    const iblRotation = +180;

    // Update Size
    this[$updateSize]();

    // create Frame and Expressions
    const frame = new Rn.Frame();

    // create FrameBuffers
    const {
      framebufferTargetOfGammaMsaa,
      framebufferTargetOfGammaResolve,
      framebufferTargetOfGammaResolveForReference
    } =
        createRenderTargets(
            scenario.dimensions.width, scenario.dimensions.height);

    // Load glTF Expression
    const {
      cameraComponent,
      cameraEntity,
      mainRenderPass,
      modelTransparentExpression
    } =
        await loadGltf(
            frame,
            scenario,
            framebufferTargetOfGammaMsaa,
            framebufferTargetOfGammaResolve,
            framebufferTargetOfGammaResolveForReference);

    // setup IBL
    await setupIBL(scenario, iblRotation, frame, mainRenderPass, framebufferTargetOfGammaMsaa);

    // MSAA Resolve Expression
    setupMsaaResolveExpression(
        frame,
        framebufferTargetOfGammaMsaa,
        framebufferTargetOfGammaResolve,
        framebufferTargetOfGammaResolveForReference);

    frame.addExpression(modelTransparentExpression);

    // Post GammaCorrection Expression
    setupGammaExpression(frame, framebufferTargetOfGammaResolve);

    // setup camera
    setupCamera(mainRenderPass, scenario, cameraEntity, cameraComponent);

    // Draw
    this.draw(frame);
  }

  private async initRhodonite() {
    if (this[$isRhodoniteInitDone] === false) {
      this[$canvas] = this.shadowRoot!.querySelector('canvas');
      await Rn.System.init({
        approach: Rn.ProcessApproach.DataTexture,
        canvas: this[$canvas] as HTMLCanvasElement,
      });
    }
    // Rn.MeshRendererComponent.isDepthMaskTrueForTransparencies = true;
  }

  private draw(frame: Rn.Frame) {
    requestAnimationFrame(() => {
      function draw() {
        Rn.System.process(frame);
        requestAnimationFrame(draw);
      }
      draw();
      this.dispatchEvent(
          // This notifies the framework that the model is visible and the
          // screenshot can be taken
          new CustomEvent('model-visibility', {detail: {visible: true}}));
    });
  }

  private[$updateSize]() {
    if (this[$canvas] == null || this.scenario == null) {
      return;
    }

    const canvas = this[$canvas]!;
    const {dimensions} = this.scenario;

    const dpr = window.devicePixelRatio;
    const width = dimensions.width * dpr;
    const height = dimensions.height * dpr;

    Rn.System.resizeCanvas(width, height);

    canvas.style.width = `${dimensions.width}px`;
    canvas.style.height = `${dimensions.height}px`;
  }
}

async function setupIBL(scenario: ScenarioConfig, rotation: number, frame: Rn.Frame, mainRenderPass: Rn.RenderPass, framebufferTargetOfGammaMsaa: Rn.FrameBuffer) {
  const split = scenario.lighting.split('.');
  const ext = split[split.length - 1];
  if (ext === 'hdr') {
    await prefilterFromUri(scenario.lighting, scenario, rotation, frame, mainRenderPass, framebufferTargetOfGammaMsaa);
  }
}

function setupCamera(
    mainRenderPass: any,
    scenario: ScenarioConfig,
    cameraEntity: any,
    cameraComponent: any) {
  const sceneTopLevelGraphComponents =
      mainRenderPass.sceneTopLevelGraphComponents as Rn.SceneGraphComponent[];
  const rootGroup =
      sceneTopLevelGraphComponents![0].entity as Rn.ISceneGraphEntity;
  const aabb = rootGroup.getSceneGraph().calcWorldMergedAABB();

  // Rn.MeshRendererComponent.isViewFrustumCullingEnabled = false;
  const {target, orbit} = scenario!;

  const center = [target.x, target.y, target.z];

  const theta = (orbit.theta) * Math.PI / 180;
  const phi = (orbit.phi) * Math.PI / 180;
  const radiusSinPhi = orbit.radius * Math.sin(phi);
  const eye = [
    radiusSinPhi * Math.sin(theta) + target.x,
    orbit.radius * Math.cos(phi) + target.y,
    radiusSinPhi * Math.cos(theta) + target.z
  ];
  if (orbit.radius <= 0) {
    center[0] = eye[0] - Math.sin(phi) * Math.sin(theta);
    center[1] = eye[1] - Math.cos(phi);
    center[2] = eye[2] - Math.sin(phi) * Math.cos(theta);
  }
  const up = [0, 1, 0];

  cameraEntity.getCamera().eyeInner = Rn.Vector3.fromCopyArray(eye);
  cameraEntity.getCamera().up = Rn.Vector3.fromCopyArray(up);
  cameraEntity.getCamera().directionInner = Rn.Vector3.fromCopyArray(center);
  cameraEntity.getCamera().primitiveMode = true;

  const modelRadius = aabb.lengthCenterToCorner;
  // const max = aabb.maxPoint;
  // const min = aabb.minPoint;
  // const modelRadius = Math.max(max.x - min.x, max.y - min.y, max.z - min.z);
  const far = 6 * Math.max(modelRadius, orbit.radius);
  const near = far / 100;
  cameraComponent.zNearInner = near;
  cameraComponent.zFarInner = far;
}

async function loadGltf(
    frame: Rn.Frame,
    scenario: ScenarioConfig,
    framebufferTargetOfGammaMsaa: Rn.FrameBuffer,
    framebufferTargetOfGammaResolve: Rn.FrameBuffer,
    framebufferTargetOfGammaResolveForReference: Rn.FrameBuffer) {
  const initialExpression =
      setupInitialExpression(framebufferTargetOfGammaMsaa);
  frame.addExpression(initialExpression);

  // camera
  const cameraEntity = Rn.createCameraEntity();
  const cameraComponent = cameraEntity.getCamera();
  cameraComponent.fovyInner = scenario.verticalFoV;
  cameraComponent.aspectInner =
      scenario.dimensions.width / scenario.dimensions.height;

  // gltf
  const modelOpaqueExpression = await Rn.GltfImporter.importFromUri(scenario.model, {
    cameraComponent: cameraComponent,
    defaultMaterialHelperArgumentArray: [
      {
        makeOutputSrgb: false,
      },
    ],
  });
  const modelOpaquePass = modelOpaqueExpression.unwrapForce().renderPasses[0];
  modelOpaquePass.tryToSetUniqueName('modelOpaque', true);
  modelOpaquePass.cameraComponent = cameraComponent;
  Rn.CameraComponent.current = cameraComponent.componentSID;

  modelOpaquePass.setFramebuffer(framebufferTargetOfGammaMsaa);
  modelOpaquePass.toClearColorBuffer = false;
  modelOpaquePass.toClearDepthBuffer = false;
  modelOpaquePass.setToRenderOpaquePrimitives(true);
  modelOpaquePass.setToRenderTransparentPrimitives(false);

  // Transparent
  const modelTransparentExpression = modelOpaqueExpression.unwrapForce().clone();
  modelTransparentExpression.tryToSetUniqueName('modelTransparent', true);
  const renderPassMainTranslucent = modelTransparentExpression.renderPasses[0];
  renderPassMainTranslucent.setToRenderOpaquePrimitives(false);
  renderPassMainTranslucent.setToRenderTransparentPrimitives(true);
  renderPassMainTranslucent.toClearDepthBuffer = false;
  renderPassMainTranslucent.setFramebuffer(framebufferTargetOfGammaMsaa);
  renderPassMainTranslucent.setResolveFramebuffer(
      framebufferTargetOfGammaResolve);
  const sampler = new Rn.Sampler({
    minFilter: Rn.TextureParameter.Linear,
    magFilter: Rn.TextureParameter.Linear,
    wrapS: Rn.TextureParameter.ClampToEdge,
    wrapT: Rn.TextureParameter.ClampToEdge,
  });
  sampler.create();
  for (const entity of renderPassMainTranslucent.entities) {
    const meshComponent = entity.tryToGetMesh();
    if (Rn.Is.exist(meshComponent)) {
      const mesh = meshComponent.mesh;
      if (Rn.Is.exist(mesh)) {
        for (const primitive of mesh.primitives) {
          primitive.material.setTextureParameter(
              Rn.ShaderSemantics.BackBufferTexture.str,
              framebufferTargetOfGammaResolveForReference
                  .getColorAttachedRenderTargetTexture(0)!,
              sampler);
        }
      }
    }
  }

  frame.addExpression(modelOpaqueExpression.unwrapForce());

  return {
    cameraComponent,
    cameraEntity,
    mainRenderPass: modelOpaquePass,
    modelTransparentExpression
  };
}

function setupGammaExpression(
    frame: Rn.Frame, gammaTargetFramebuffer: Rn.FrameBuffer) {
  const expressionGammaEffect = new Rn.Expression();

  // gamma correction (and super sampling)
  const postEffectCameraEntity = createPostEffectCameraEntity();
  const postEffectCameraComponent = postEffectCameraEntity.getCamera();

  const gammaCorrectionMaterial =
      Rn.MaterialHelper.createGammaCorrectionMaterial();
  // gammaCorrectionMaterial.setParameter(Rn.ShaderSemantics.EnableLinearToSrgb,
  // Rn.Scalar.fromCopyNumber(0));
  const gammaCorrectionRenderPass = createPostEffectRenderPass(
      gammaCorrectionMaterial, postEffectCameraComponent);

  setTextureParameterForMeshComponents(
      gammaCorrectionRenderPass.meshComponents!,
      Rn.ShaderSemantics.BaseColorTexture,
      gammaTargetFramebuffer.getColorAttachedRenderTargetTexture(0));

  expressionGammaEffect.addRenderPasses([gammaCorrectionRenderPass]);

  frame.addExpression(expressionGammaEffect);
}

function setupInitialExpression(framebufferTargetOfGammaMsaa: Rn.FrameBuffer) {
  const expression = new Rn.Expression();
  expression.tryToSetUniqueName('Initial', true);
  const initialRenderPass = new Rn.RenderPass();
  initialRenderPass.clearColor =
      Rn.Vector4.fromCopyArray4([0.0, 0.0, 0.0, 0.0]);
  initialRenderPass.toClearColorBuffer = false;
  initialRenderPass.toClearDepthBuffer = true;
  const initialRenderPassForFrameBuffer = new Rn.RenderPass();
  initialRenderPassForFrameBuffer.clearColor =
      Rn.Vector4.fromCopyArray4([0.0, 0.0, 0.0, 0.0]);
  initialRenderPassForFrameBuffer.toClearColorBuffer = true;
  initialRenderPassForFrameBuffer.toClearDepthBuffer = true;
  initialRenderPassForFrameBuffer.setFramebuffer(framebufferTargetOfGammaMsaa)
  expression.addRenderPasses(
      [initialRenderPass, initialRenderPassForFrameBuffer]);
  return expression;
}

function setupMsaaResolveExpression(
    frame: Rn.Frame,
    framebufferTargetOfGammaMsaa: Rn.FrameBuffer,
    framebufferTargetOfGammaResolve: Rn.FrameBuffer,
    framebufferTargetOfGammaResolveForReference: Rn.FrameBuffer) {
  const expressionForResolve = new Rn.Expression()
  expressionForResolve.tryToSetUniqueName('Resolve', true)
  const renderPassForResolve = new Rn.RenderPass()
  expressionForResolve.addRenderPasses([renderPassForResolve])

  renderPassForResolve.toClearDepthBuffer = false
  renderPassForResolve.setFramebuffer(framebufferTargetOfGammaMsaa)
  renderPassForResolve.setResolveFramebuffer(framebufferTargetOfGammaResolve)
  renderPassForResolve.setResolveFramebuffer2(
      framebufferTargetOfGammaResolveForReference)
  // getRnAppModel().setResolveExpression(expressionForResolve.objectUID)

  frame.addExpression(expressionForResolve);

  return expressionForResolve;
}

function createRenderTargets(canvasWidth: number, canvasHeight: number) {
  // MSAA depth
  const framebufferTargetOfGammaMsaa =
      Rn.RenderableHelper.createFrameBufferMSAA({
        width: canvasWidth,
        height: canvasHeight,
        colorBufferNum: 1,
        colorFormats: [Rn.TextureFormat.RGBA8],
        sampleCountMSAA: 4,
        depthBufferFormat: Rn.TextureFormat.Depth32F,
      });
  framebufferTargetOfGammaMsaa.tryToSetUniqueName(
      'FramebufferTargetOfGammaMsaa', true);

  // Resolve Color 1
  const framebufferTargetOfGammaResolve =
      Rn.RenderableHelper.createFrameBuffer({
        width: canvasWidth,
        height: canvasHeight,
        textureNum: 1,
        textureFormats: [Rn.TextureFormat.RGBA8],
        createDepthBuffer: false,
      });
  framebufferTargetOfGammaResolve.tryToSetUniqueName(
      'FramebufferTargetOfGammaResolve', true);

  // Resolve Color 2
  const framebufferTargetOfGammaResolveForReference =
      Rn.RenderableHelper.createFrameBuffer({
        width: canvasWidth,
        height: canvasHeight,
        textureNum: 1,
        textureFormats: [Rn.TextureFormat.RGBA8],
        createDepthBuffer: false,
      });
  framebufferTargetOfGammaResolveForReference.tryToSetUniqueName(
      'FramebufferTargetOfGammaResolveForReference', true);
  return {
    framebufferTargetOfGammaMsaa,
    framebufferTargetOfGammaResolve,
    framebufferTargetOfGammaResolveForReference
  };
}

function createPostEffectRenderPass(
    material: Rn.Material, cameraComponent: Rn.CameraComponent) {
  const boardPrimitive = new Rn.Plane();
  boardPrimitive.generate({
    width: 1,
    height: 1,
    uSpan: 1,
    vSpan: 1,
    isUVRepeat: false,
    material,
  });

  const boardMesh = new Rn.Mesh();
  boardMesh.addPrimitive(boardPrimitive);

  const boardEntity = Rn.createMeshEntity();
  boardEntity.getTransform().localEulerAngles = Rn.Vector3.fromCopyArray([
    Math.PI / 2,
    0.0,
    0.0,
  ]);
  boardEntity.getTransform().localPosition = Rn.Vector3.fromCopyArray([
    0.0,
    0.0,
    -0.5,
  ]);
  const boardMeshComponent = boardEntity.getMesh();
  boardMeshComponent.setMesh(boardMesh);

  const renderPass = new Rn.RenderPass();
  renderPass.toClearColorBuffer = false;
  renderPass.cameraComponent = cameraComponent;
  renderPass.addEntities([boardEntity]);

  return renderPass;
}


function createPostEffectCameraEntity() {
  const cameraEntity = Rn.createCameraEntity();
  const cameraComponent = cameraEntity.getCamera();
  cameraComponent.zNearInner = 0.5;
  cameraComponent.zFarInner = 2.0;
  return cameraEntity;
}

function setTextureParameterForMeshComponents(
    meshComponents: Rn.MeshComponent[],
    shaderSemantic: Rn.ShaderSemanticsEnum,
    value: any) {
  for (let i = 0; i < meshComponents.length; i++) {
    const mesh = meshComponents[i].mesh;
    if (!mesh)
      continue;

    const primitiveNumber = mesh.getPrimitiveNumber();
    for (let j = 0; j < primitiveNumber; j++) {
      const primitive = mesh.getPrimitiveAt(j);
      const sampler = new Rn.Sampler({
        minFilter: Rn.TextureParameter.Linear,
        magFilter: Rn.TextureParameter.Linear,
        wrapS: Rn.TextureParameter.ClampToEdge,
        wrapT: Rn.TextureParameter.ClampToEdge,
      });
      sampler.create();
      primitive.material.setTextureParameter(shaderSemantic.str, value, sampler);
    }
  }
}

async function prefilterFromUri(hdrFileUri: string, scenario: ScenarioConfig, rotation: number, frame: Rn.Frame, mainRenderPass: Rn.RenderPass, framebufferTargetOfGammaMsaa: Rn.FrameBuffer) {
  const arrayBuffer = await fetch(hdrFileUri).then(res => res.arrayBuffer());
  const data = loadHDR(new Uint8Array(arrayBuffer));
  await prefilterHdrAndSetIBL(data, scenario, rotation, frame, mainRenderPass, framebufferTargetOfGammaMsaa);
}

// function setupPrefilteredIBLTexture(prefilter: any, rotation: number) {
//   const specularCubeTexture = new Rn.CubeTexture()
//   const specularTextureTypedArrayImages =
//       getSpecularCubeTextureTypedArrays(prefilter)
//   specularCubeTexture.mipmapLevelNumber = specularTextureTypedArrayImages.length
//   const specularTextureSize = getSpecularCubeTextureSize(prefilter, 0)
//   specularCubeTexture.generateTextureFromTypedArrays(
//       specularTextureTypedArrayImages, specularTextureSize, specularTextureSize)
//   specularCubeTexture.hdriFormat = Rn.HdriFormat.RGBE_PNG

//   const diffuseCubeTexture = new Rn.CubeTexture()
//   const diffuseTextureTypedArrayImages =
//       getDiffuseCubeTextureTypedArrays(prefilter)
//   const diffuseTextureSize = getDiffuseCubeTextureSize(prefilter)
//   diffuseCubeTexture.generateTextureFromTypedArrays(
//       diffuseTextureTypedArrayImages, diffuseTextureSize, diffuseTextureSize)
//   diffuseCubeTexture.hdriFormat = Rn.HdriFormat.RGBE_PNG;

//   attachIBLTextureToAllMeshComponents(
//       diffuseCubeTexture, specularCubeTexture, rotation);

//   return [diffuseCubeTexture, specularCubeTexture];
// }


export function getEnvCubeTextureSize(prefilter: any) {
  return prefilter.hdr_cubemap_texture_size()
}

export function getDiffuseCubeTextureSize(prefilter: any) {
  return prefilter.irradiance_cubemap_texture_size()
}

export function getSpecularCubeTextureSize(prefilter: any, mipLevel: number) {
  return prefilter.pmrem_cubemap_texture_size(mipLevel)
}

function attachIBLTextureToAllMeshComponents(
    diffuseCubeTexture: Rn.CubeTexture,
    specularCubeTexture: Rn.CubeTexture,
    rotation: number) {
  const meshRendererComponents =
      Rn.ComponentRepository.getComponentsWithType(Rn.MeshRendererComponent) as
      Rn.MeshRendererComponent[];
  for (let i = 0; i < meshRendererComponents.length; i++) {
    const meshRendererComponent = meshRendererComponents[i];
    meshRendererComponent.setIBLCubeMap(diffuseCubeTexture, specularCubeTexture);
    meshRendererComponent.diffuseCubeMapContribution = 0.5;
    meshRendererComponent.specularCubeMapContribution = 0.5;
    meshRendererComponent.rotationOfCubeMap =
        Rn.MathUtil.degreeToRadian(rotation)
  }
  const meshComponents = Rn.ComponentRepository.getComponentsWithType(
                             Rn.MeshComponent) as Rn.MeshComponent[];
  for (let i = 0; i < meshComponents.length; i++) {
    const meshComponent = meshComponents[i];
    const mesh = meshComponent.mesh;
    if (Rn.Is.exist(mesh)) {
      for (let i = 0; i < mesh.getPrimitiveNumber(); i++) {
        const primitive = mesh.getPrimitiveAt(i);
        primitive.material.setParameter(
            Rn.ShaderSemantics.InverseEnvironment.str, Rn.Scalar.fromCopyNumber(0));
      }
    }
  }
}


// function setPrefilteredEnvCubeTexture(
//     cubeTexture: Rn.CubeTexture,
//     sphereMaterial: Rn.Material,
//     prefilter: unknown) {
//   const envCubeTextureTypedArrayImages = getEnvCubeTextureTypedArrays(prefilter)
//   const envCubeTextureSize = getEnvCubeTextureSize(prefilter)

//   cubeTexture.generateTextureFromTypedArrays(
//       envCubeTextureTypedArrayImages, envCubeTextureSize, envCubeTextureSize)
//   cubeTexture.hdriFormat = Rn.HdriFormat.RGBE_PNG
//   sphereMaterial.setParameter(
//       Rn.ShaderSemantics.EnvHdriFormat.str, Rn.HdriFormat.RGBE_PNG.index)
// }

function setupBackgroundEnvCubeExpression(
    frame: Rn.Frame,
    framebufferTargetOfGammaMsaa: Rn.FrameBuffer,
    mainRenderPass: Rn.RenderPass,
    environmentCubeTexture: Rn.CubeTexture,
    scenario: ScenarioConfig,
    rotation: number) {
  // create sphere
  const sphereEntity = Rn.createMeshEntity()
  sphereEntity.tryToSetUniqueName('Sphere Env Cube', true)
  sphereEntity.tryToSetTag({
    tag: 'type',
    value: 'background-assets',
  })
  const spherePrimitive = new Rn.Sphere()
  const sphereMaterial = Rn.MaterialHelper.createEnvConstantMaterial();
  sphereMaterial.setParameter(Rn.ShaderSemantics.MakeOutputSrgb.str, 0);
  sphereMaterial.setParameter(
      Rn.ShaderSemantics.envRotation.str, Rn.MathUtil.degreeToRadian(rotation));
  sphereMaterial.setParameter(
      Rn.ShaderSemantics.InverseEnvironment.str, Rn.Scalar.fromCopyNumber(0));

  // environment Cube Texture
  const sampler = new Rn.Sampler({
    minFilter: Rn.TextureParameter.Linear,
    magFilter: Rn.TextureParameter.Linear,
    wrapS: Rn.TextureParameter.ClampToEdge,
    wrapT: Rn.TextureParameter.ClampToEdge,
  });
  sampler.create();
  sphereMaterial.setTextureParameter(
      Rn.ShaderSemantics.ColorEnvTexture.str, environmentCubeTexture, sampler)

  // setup sphere
  const sceneTopLevelGraphComponents =
      mainRenderPass.sceneTopLevelGraphComponents as Rn.SceneGraphComponent[];
  const rootGroup =
      sceneTopLevelGraphComponents![0].entity as Rn.ISceneGraphEntity;
  const aabb = rootGroup.getSceneGraph().calcWorldMergedAABB();
  spherePrimitive.generate({
    radius: aabb.lengthCenterToCorner * 6.0,
    widthSegments: 40,
    heightSegments: 40,
    material: sphereMaterial
  })
  const sphereMeshComponent =
      sphereEntity.getComponent(Rn.MeshComponent) as Rn.MeshComponent
  const sphereMesh = new Rn.Mesh()
  sphereMesh.addPrimitive(spherePrimitive)
  sphereMeshComponent.setMesh(sphereMesh)
  sphereEntity.getTransform().localPosition = Rn.Vector3.fromCopy3(
      scenario.target.x, scenario.target.y, scenario.target.z);
  sphereEntity.getTransform().localScale = Rn.Vector3.fromCopyArray3([-1, 1, 1])
  if (!scenario.renderSkybox) {
    sphereEntity.getSceneGraph().isVisible = false
  }

  const renderPass = new Rn.RenderPass()
  renderPass.clearColor = Rn.Vector4.fromCopyArray4([0, 0, 0, 0])
  renderPass.addEntities([sphereEntity])
  // renderPass.cameraComponent = cameraComponent
  renderPass.toClearDepthBuffer = false
  renderPass.isDepthTest = true
  renderPass.toClearColorBuffer = false
  renderPass.setFramebuffer(framebufferTargetOfGammaMsaa)

  const expression = new Rn.Expression()
  expression.tryToSetUniqueName('EnvCube', true);
  expression.addRenderPasses([renderPass])

  frame.addExpression(expression);
  // frame;
  return expression
}

export async function prefilterHdrAndSetIBL(data: { width: number; height: number; dataFloat: Float32Array }, scenario: ScenarioConfig, rotation: number, frame: Rn.Frame, mainRenderPass: Rn.RenderPass, framebufferTargetOfGammaMsaa: Rn.FrameBuffer) {
  return new Promise(async (resolve) => {
    
    const cubeMapSize = 512;

    const hdrTexture = new Rn.Texture()
    hdrTexture.allocate({
      width: data.width,
      height: data.height,
      format: Rn.TextureFormat.RGBA32F,
    })

    const pixels = new Float32Array(data.width * data.height * 4);
    for (let i = 0; i < data.width * data.height; i++) {
      pixels[i * 4] = data.dataFloat[i * 3];
      pixels[i * 4 + 1] = data.dataFloat[i * 3 + 1];
      pixels[i * 4 + 2] = data.dataFloat[i * 3 + 2];
      pixels[i * 4 + 3] = 1.0;
    }

    await hdrTexture.loadImageToMipLevel({
      mipLevel: 0,
      xOffset: 0,
      yOffset: 0,
      width: data.width,
      height: data.height,
      rowSizeByPixel: data.width,
      data: pixels,
      type: Rn.ComponentType.Float,
    });

    // Create material
    const panoramaToCubeMaterial = Rn.MaterialHelper.createPanoramaToCubeMaterial();
    panoramaToCubeMaterial.setParameter('cubeMapFaceId', 0);

    // Create expression
    const panoramaToCubeExpression = new Rn.Expression();

    const [panoramaToCubeFramebuffer, panoramaToCubeRenderTargetCube] =
      Rn.RenderableHelper.createFrameBufferCubeMap({
        width: cubeMapSize,
        height: cubeMapSize,
        textureFormat: Rn.TextureFormat.RGBA32F,
        // mipLevelCount: 1,
      });

    // Create renderPass and set hdrTexture to panoramaToCubeMaterial
    const panoramaToCubeRenderPass = Rn.RenderPassHelper.createScreenDrawRenderPassWithBaseColorTexture(
      panoramaToCubeMaterial,
      hdrTexture
    );

    panoramaToCubeRenderPass.toClearColorBuffer = false;
    panoramaToCubeRenderPass.toClearDepthBuffer = false;
    panoramaToCubeRenderPass.isDepthTest = false;
    panoramaToCubeRenderPass.setFramebuffer(panoramaToCubeFramebuffer);
    panoramaToCubeExpression.addRenderPasses([panoramaToCubeRenderPass]);

    const prefilterIblMaterial = Rn.MaterialHelper.createPrefilterIBLMaterial();
    prefilterIblMaterial.setParameter('cubeMapFaceId', 0);

    const prefilterIblExpression = new Rn.Expression();

    const [diffuseIblFramebuffer, diffuseIblRenderTargetCube] =
      Rn.RenderableHelper.createFrameBufferCubeMap({
        width: cubeMapSize,
        height: cubeMapSize,
        textureFormat: Rn.TextureFormat.RGBA32F,
        mipLevelCount: 1,
      });
    const [specularIblFramebuffer, specularIblRenderTargetCube] =
      Rn.RenderableHelper.createFrameBufferCubeMap({
        width: cubeMapSize,
        height: cubeMapSize,
        textureFormat: Rn.TextureFormat.RGBA32F,
      });

    const sampler = new Rn.Sampler({
      magFilter: Rn.TextureParameter.Linear,
      minFilter: Rn.TextureParameter.LinearMipmapLinear,
      wrapS: Rn.TextureParameter.ClampToEdge,
      wrapT: Rn.TextureParameter.ClampToEdge,
      wrapR: Rn.TextureParameter.ClampToEdge,
    });
    sampler.create();
    const prefilterIblRenderPass = Rn.RenderPassHelper.createScreenDrawRenderPassWithBaseColorTexture(
      prefilterIblMaterial,
      panoramaToCubeRenderTargetCube,
      sampler
    );

    prefilterIblRenderPass.toClearColorBuffer = false;
    prefilterIblRenderPass.toClearDepthBuffer = false;
    prefilterIblRenderPass.isDepthTest = false;
    prefilterIblRenderPass.setFramebuffer(diffuseIblFramebuffer);
    prefilterIblExpression.addRenderPasses([prefilterIblRenderPass]);


    const renderIBL = () => {
      panoramaToCubeRenderPass.setFramebuffer(panoramaToCubeFramebuffer);

      for (let i = 0; i < 6; i++) {
        panoramaToCubeMaterial.setParameter('cubeMapFaceId', i);
        panoramaToCubeFramebuffer.setColorAttachmentCubeAt(0, i, 0, panoramaToCubeRenderTargetCube);
        Rn.System.process([panoramaToCubeExpression]);
      }

      panoramaToCubeRenderTargetCube.generateMipmaps();

      prefilterIblRenderPass.setFramebuffer(diffuseIblFramebuffer);
      prefilterIblMaterial.setParameter('distributionType', 0);

      for (let i = 0; i < 6; i++) {
        prefilterIblMaterial.setParameter('cubeMapFaceId', i);
        diffuseIblFramebuffer.setColorAttachmentCubeAt(0, i, 0, diffuseIblRenderTargetCube);
        Rn.System.process([prefilterIblExpression]);
      }

      prefilterIblRenderPass.setFramebuffer(specularIblFramebuffer);
      prefilterIblMaterial.setParameter('distributionType', 1);

      const mipLevelCount = Math.floor(Math.log2(cubeMapSize)) + 1;
      for (let i = 0; i < mipLevelCount; i++) {
        const roughness = i / (mipLevelCount - 1);
        prefilterIblMaterial.setParameter('roughness', roughness);
        for (let face = 0; face < 6; face++) {
          prefilterIblMaterial.setParameter('cubeMapFaceId', face);
          specularIblFramebuffer.setColorAttachmentCubeAt(0, face, i, specularIblRenderTargetCube);
          prefilterIblRenderPass.setViewport(
            Rn.Vector4.fromCopy4(0, 0, cubeMapSize >> i, cubeMapSize >> i)
          );
          Rn.System.process([prefilterIblExpression]);
        }
      }
    };

    setTimeout(async () => {
      renderIBL();

      attachIBLTextureToAllMeshComponents(
        diffuseIblRenderTargetCube as unknown as Rn.CubeTexture,
        specularIblRenderTargetCube as unknown as Rn.CubeTexture,
        rotation
      );

      setupBackgroundEnvCubeExpression(
        frame,
        framebufferTargetOfGammaMsaa,
        mainRenderPass,
        panoramaToCubeRenderTargetCube as unknown as Rn.CubeTexture,
        scenario,
        rotation);

      // const sphereMaterial = getRnAppModel().getSphereMaterial()
      // const sampler2 = new Rn.Sampler({
      //   wrapS: Rn.TextureParameter.ClampToEdge,
      //   wrapT: Rn.TextureParameter.ClampToEdge,
      //   minFilter: Rn.TextureParameter.Linear,
      //   magFilter: Rn.TextureParameter.Linear
      // })
      // sphereMaterial.setTextureParameter(
      //   'colorEnvTexture', panoramaToCubeRenderTargetCube, sampler2
      // )

      resolve(true);
    }, 1000);
  });
}


/**
 * The original code is hdrpng.js by Enki https://enkimute.github.io/hdrpng.js/
 *
 * Refactored and simplified version.
 */
function rgbeToFloat(buffer: Uint8Array): Float32Array {
  const l = buffer.byteLength >> 2;
  const res = new Float32Array(l * 3);
  for (var i = 0; i < l; i++) {
    const s = Math.pow(2, buffer[i * 4 + 3] - (128 + 8));
    res[i * 3] = buffer[i * 4] * s;
    res[i * 3 + 1] = buffer[i * 4 + 1] * s;
    res[i * 3 + 2] = buffer[i * 4 + 2] * s;
  }
  return res;
}
export function loadHDR(uint8Array: Uint8Array): { width: number; height: number; dataFloat: Float32Array } {
  let header = '';
  let pos = 0;
  const d8 = uint8Array;
  let format = undefined as string | undefined;

  // read header.
  while (!header.match(/\n\n[^\n]+\n/g)) header += String.fromCharCode(d8[pos++]);

  // check format.
  format = header.match(/FORMAT=(.*)$/m)![1];
  if (format != '32-bit_rle_rgbe') {
    throw new Error('unknown format : ' + format);
  }

  // parse resolution
  let rez = header.split(/\n/).reverse()[1].split(' ');
  const width = (rez[3] as any) * 1;
  const height = (rez[1] as any) * 1;

  // Create image.
  const img = new Uint8Array(width * height * 4);
  let ipos = 0;

  let i = 0;

  // Read all scanlines
  for (let j = 0; j < height; j++) {
    let rgbe = d8.slice(pos, (pos += 4));
    const scanline: number[] = [];
    if (rgbe[0] != 2 || rgbe[1] != 2 || rgbe[2] & 0x80) {
      let len = width,
        rs = 0;
      pos -= 4;
      while (len > 0) {
        img.set(d8.slice(pos, (pos += 4)), ipos);
        if (img[ipos] == 1 && img[ipos + 1] == 1 && img[ipos + 2] == 1) {
          for (img[ipos + 3] << rs; i > 0; i--) {
            img.set(img.slice(ipos - 4, ipos), ipos);
            ipos += 4;
            len--;
          }
          rs += 8;
        } else {
          len--;
          ipos += 4;
          rs = 0;
        }
      }
    } else {
      if ((rgbe[2] << 8) + rgbe[3] != width) {
        throw new Error('HDR line mismatch ..');
      }
      for (i = 0; i < 4; i++) {
        let ptr = i * width,
          ptr_end = (i + 1) * width,
          buf,
          count;
        while (ptr < ptr_end) {
          buf = d8.slice(pos, (pos += 2));
          if (buf[0] > 128) {
            count = buf[0] - 128;
            while (count-- > 0) scanline[ptr++] = buf[1];
          } else {
            count = buf[0] - 1;
            scanline[ptr++] = buf[1];
            while (count-- > 0) scanline[ptr++] = d8[pos++];
          }
        }
      }
      for (i = 0; i < width; i++) {
        img[ipos++] = scanline[i];
        img[ipos++] = scanline[i + width];
        img[ipos++] = scanline[i + 2 * width];
        img[ipos++] = scanline[i + 3 * width];
      }
    }
  }

  const imageFloat32Buffer = rgbeToFloat(img);

  return {
    width,
    height,
    dataFloat: imageFloat32Buffer,
  };
}
