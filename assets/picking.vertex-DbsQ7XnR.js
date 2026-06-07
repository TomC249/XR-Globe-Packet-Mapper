import{t as e}from"./shaderStore-DZjcEDJh.js";import"./bonesDeclaration-CaTbAVFV.js";import"./bakedVertexAnimation-uMygVGIU.js";import"./morphTargetsVertexGlobalDeclaration-D_Jmp3KX.js";import"./morphTargetsVertexDeclaration-XHL4HV28.js";import"./instancesDeclaration-DwEhnqAl.js";import"./morphTargetsVertexGlobal-FcHNDCAw.js";import"./morphTargetsVertex-CW_PqvB-.js";import"./instancesVertex-BQqYSCbj.js";import"./bonesVertex-D51o-zEq.js";var t=`pickingVertexShader`,n=`attribute position: vec3f;
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
//# sourceMappingURL=picking.vertex-DbsQ7XnR.js.map