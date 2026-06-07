import{t as e}from"./shaderStore-DZjcEDJh.js";import"./bonesDeclaration-UJJpnNV4.js";import"./bakedVertexAnimation-Bzbmmqg6.js";import"./morphTargetsVertexGlobalDeclaration-Dj-Jnd6s.js";import"./morphTargetsVertexDeclaration-sF0ATvxh.js";import"./instancesDeclaration-2cBhRrfU.js";import"./morphTargetsVertexGlobal-yhSHgSDX.js";import"./morphTargetsVertex-RoNGb74G.js";import"./instancesVertex-BqPqWbqK.js";import"./bonesVertex-DY73zrMX.js";import"./clipPlaneVertexDeclaration-DGXX8QeY.js";import"./clipPlaneVertex-bgd5rCvN.js";import"./logDepthDeclaration-BcOMjcfh.js";import"./logDepthVertex-CzANwIJn.js";var t=`outlineVertexShader`,n=`attribute vec3 position;attribute vec3 normal;
#include<bonesDeclaration>
#include<bakedVertexAnimationDeclaration>
#include<morphTargetsVertexGlobalDeclaration>
#include<morphTargetsVertexDeclaration>[0..maxSimultaneousMorphTargets]
#include<clipPlaneVertexDeclaration>
uniform float offset;
#include<instancesDeclaration>
uniform mat4 viewProjection;
#ifdef ALPHATEST
varying vec2 vUV;uniform mat4 diffuseMatrix;
#ifdef UV1
attribute vec2 uv;
#endif
#ifdef UV2
attribute vec2 uv2;
#endif
#endif
#include<logDepthDeclaration>
#define CUSTOM_VERTEX_DEFINITIONS
void main(void)
{vec3 positionUpdated=position;vec3 normalUpdated=normal;
#ifdef UV1
vec2 uvUpdated=uv;
#endif
#ifdef UV2
vec2 uv2Updated=uv2;
#endif
#include<morphTargetsVertexGlobal>
#include<morphTargetsVertex>[0..maxSimultaneousMorphTargets]
vec3 offsetPosition=positionUpdated+(normalUpdated*offset);
#include<instancesVertex>
#include<bonesVertex>
#include<bakedVertexAnimation>
vec4 worldPos=finalWorld*vec4(offsetPosition,1.0);gl_Position=viewProjection*worldPos;
#ifdef ALPHATEST
#ifdef UV1
vUV=vec2(diffuseMatrix*vec4(uvUpdated,1.0,0.0));
#endif
#ifdef UV2
vUV=vec2(diffuseMatrix*vec4(uv2Updated,1.0,0.0));
#endif
#endif
#include<clipPlaneVertex>
#include<logDepthVertex>
}
`;e.ShadersStore[t]||(e.ShadersStore[t]=n);var r={name:t,shader:n};export{r as t};
//# sourceMappingURL=outline.vertex-CD8POD5p.js.map