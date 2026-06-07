import{t as e}from"./shaderStore-DZjcEDJh.js";import"./bonesDeclaration-UJJpnNV4.js";import"./bakedVertexAnimation-Bzbmmqg6.js";import"./morphTargetsVertexGlobalDeclaration-Dj-Jnd6s.js";import"./morphTargetsVertexDeclaration-sF0ATvxh.js";import"./instancesDeclaration-2cBhRrfU.js";import"./morphTargetsVertexGlobal-yhSHgSDX.js";import"./morphTargetsVertex-RoNGb74G.js";import"./instancesVertex-BqPqWbqK.js";import"./bonesVertex-DY73zrMX.js";var t=`pickingVertexShader`,n=`attribute vec3 position;
#if defined(INSTANCES)
attribute vec4 instanceMeshID;
#endif
#include<bonesDeclaration>
#include<bakedVertexAnimationDeclaration>
#include<morphTargetsVertexGlobalDeclaration>
#include<morphTargetsVertexDeclaration>[0..maxSimultaneousMorphTargets]
#include<instancesDeclaration>
uniform mat4 viewProjection;
#if defined(INSTANCES)
varying vec4 vMeshID;
#endif
void main(void) {
#include<morphTargetsVertexGlobal>
#include<morphTargetsVertex>[0..maxSimultaneousMorphTargets]
#include<instancesVertex>
#include<bonesVertex>
#include<bakedVertexAnimation>
vec4 worldPos=finalWorld*vec4(position,1.0);gl_Position=viewProjection*worldPos;
#if defined(INSTANCES)
vMeshID=instanceMeshID;
#endif
}`;e.ShadersStore[t]||(e.ShadersStore[t]=n);var r={name:t,shader:n};export{r as t};
//# sourceMappingURL=picking.vertex-D7cGZKqu.js.map