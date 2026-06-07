import{t as e}from"./shaderStore-DZjcEDJh.js";import"./bonesDeclaration-UJJpnNV4.js";import"./bakedVertexAnimation-Bzbmmqg6.js";import"./morphTargetsVertexGlobalDeclaration-Dj-Jnd6s.js";import"./morphTargetsVertexDeclaration-sF0ATvxh.js";import"./instancesDeclaration-2cBhRrfU.js";import"./morphTargetsVertexGlobal-yhSHgSDX.js";import"./morphTargetsVertex-RoNGb74G.js";import"./instancesVertex-BqPqWbqK.js";import"./bonesVertex-DY73zrMX.js";import"./clipPlaneVertexDeclaration-DGXX8QeY.js";import"./clipPlaneVertex-bgd5rCvN.js";import"./pointCloudVertex-DFwxusjL.js";var t=`pointCloudVertexDeclaration`,n=`#ifdef POINTSIZE
uniform float pointSize;
#endif
`;e.IncludesShadersStore[t]||(e.IncludesShadersStore[t]=n);var r=`depthVertexShader`,i=`attribute vec3 position;
#include<bonesDeclaration>
#include<bakedVertexAnimationDeclaration>
#include<morphTargetsVertexGlobalDeclaration>
#include<morphTargetsVertexDeclaration>[0..maxSimultaneousMorphTargets]
#include<clipPlaneVertexDeclaration>
#include<instancesDeclaration>
uniform mat4 viewProjection;uniform vec2 depthValues;
#if defined(ALPHATEST) || defined(NEED_UV)
varying vec2 vUV;uniform mat4 diffuseMatrix;
#ifdef UV1
attribute vec2 uv;
#endif
#ifdef UV2
attribute vec2 uv2;
#endif
#endif
#ifdef STORE_CAMERASPACE_Z
uniform mat4 view;varying vec4 vViewPos;
#endif
#include<pointCloudVertexDeclaration>
varying float vDepthMetric;
#define CUSTOM_VERTEX_DEFINITIONS
void main(void)
{vec3 positionUpdated=position;
#ifdef UV1
vec2 uvUpdated=uv;
#endif
#ifdef UV2
vec2 uv2Updated=uv2;
#endif
#include<morphTargetsVertexGlobal>
#include<morphTargetsVertex>[0..maxSimultaneousMorphTargets]
#include<instancesVertex>
#include<bonesVertex>
#include<bakedVertexAnimation>
vec4 worldPos=finalWorld*vec4(positionUpdated,1.0);
#include<clipPlaneVertex>
gl_Position=viewProjection*worldPos;
#ifdef STORE_CAMERASPACE_Z
vViewPos=view*worldPos;
#else
#ifdef USE_REVERSE_DEPTHBUFFER
vDepthMetric=((-gl_Position.z+depthValues.x)/(depthValues.y));
#else
vDepthMetric=((gl_Position.z+depthValues.x)/(depthValues.y));
#endif
#endif
#if defined(ALPHATEST) || defined(BASIC_RENDER)
#ifdef UV1
vUV=vec2(diffuseMatrix*vec4(uvUpdated,1.0,0.0));
#endif
#ifdef UV2
vUV=vec2(diffuseMatrix*vec4(uv2Updated,1.0,0.0));
#endif
#endif
#include<pointCloudVertex>
}
`;e.ShadersStore[r]||(e.ShadersStore[r]=i);var a={name:r,shader:i};export{a as t};
//# sourceMappingURL=depth.vertex-nXY5J1a8.js.map