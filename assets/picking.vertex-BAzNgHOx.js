import{t as e}from"./shaderStore-Dw977DTa.js";import"./bonesDeclaration-DCsTCT-9.js";import"./bakedVertexAnimation-Dfq0IhE-.js";import"./morphTargetsVertexGlobalDeclaration-B2dmcBTj.js";import"./morphTargetsVertexDeclaration-xvT3ZP-Z.js";import"./instancesDeclaration-CZ2gULKv.js";import"./morphTargetsVertexGlobal-BIIsomI-.js";import"./morphTargetsVertex-ClcH-zuY.js";import"./instancesVertex-wigqid0_.js";import"./bonesVertex-DRkK2fhy.js";var t=`pickingVertexShader`,n=`attribute vec3 position;
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
//# sourceMappingURL=picking.vertex-BAzNgHOx.js.map