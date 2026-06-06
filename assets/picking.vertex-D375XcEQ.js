import{t as e}from"./shaderStore-Dw977DTa.js";import"./bonesDeclaration-COkQL5Lp.js";import"./bakedVertexAnimation-BtnAobRg.js";import"./morphTargetsVertexGlobalDeclaration-BlvG49UW.js";import"./morphTargetsVertexDeclaration-BJkUfBZG.js";import"./instancesDeclaration-Blk6-6Mm.js";import"./morphTargetsVertexGlobal-CHoq9I0d.js";import"./morphTargetsVertex-D161ek1L.js";import"./instancesVertex-TvMjfaZj.js";import"./bonesVertex-DcL_yEuI.js";var t=`pickingVertexShader`,n=`attribute position: vec3f;
#if defined(INSTANCES)
attribute instanceMeshID: vec4f;
#endif
#include<bonesDeclaration>
#include<bakedVertexAnimationDeclaration>
#include<morphTargetsVertexGlobalDeclaration>
#include<morphTargetsVertexDeclaration>[0..maxSimultaneousMorphTargets]
#include<instancesDeclaration>
uniform viewProjection: mat4x4f;
#if defined(INSTANCES)
varying vMeshID: vec4f;
#endif
@vertex
fn main(input : VertexInputs)->FragmentInputs {
#include<morphTargetsVertexGlobal>
#include<morphTargetsVertex>[0..maxSimultaneousMorphTargets]
#include<instancesVertex>
#include<bonesVertex>
#include<bakedVertexAnimation>
var worldPos: vec4f=finalWorld*vec4f(input.position,1.0);vertexOutputs.position=uniforms.viewProjection*worldPos;
#if defined(INSTANCES)
vertexOutputs.vMeshID=input.instanceMeshID;
#endif
}`;e.ShadersStoreWGSL[t]||(e.ShadersStoreWGSL[t]=n);var r={name:t,shader:n};export{r as t};
//# sourceMappingURL=picking.vertex-D375XcEQ.js.map