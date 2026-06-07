import{t as e}from"./shaderStore-DZjcEDJh.js";import"./bonesDeclaration-CaTbAVFV.js";import"./bakedVertexAnimation-uMygVGIU.js";import"./instancesDeclaration-DwEhnqAl.js";import"./instancesVertex-BQqYSCbj.js";import"./bonesVertex-D51o-zEq.js";import"./clipPlaneVertexDeclaration-BD8XBZFs.js";import"./clipPlaneVertex-CzIpx5jY.js";import"./fogVertexDeclaration-d6__fboV.js";import"./fogVertex-7iyuY1hv.js";import"./vertexColorMixing-huOyRw1t.js";var t=`colorVertexShader`,n=`attribute position: vec3f;
#ifdef VERTEXCOLOR
attribute color: vec4f;
#endif
#include<bonesDeclaration>
#include<bakedVertexAnimationDeclaration>
#include<clipPlaneVertexDeclaration>
#include<fogVertexDeclaration>
#ifdef FOG
uniform view: mat4x4f;
#endif
#include<instancesDeclaration>
uniform viewProjection: mat4x4f;
#if defined(VERTEXCOLOR) || defined(INSTANCESCOLOR) && defined(INSTANCES)
varying vColor: vec4f;
#endif
#define CUSTOM_VERTEX_DEFINITIONS
@vertex
fn main(input : VertexInputs)->FragmentInputs {
#define CUSTOM_VERTEX_MAIN_BEGIN
#ifdef VERTEXCOLOR
var colorUpdated: vec4f=vertexInputs.color;
#endif
#include<instancesVertex>
#include<bonesVertex>
#include<bakedVertexAnimation>
var worldPos: vec4f=finalWorld* vec4f(input.position,1.0);vertexOutputs.position=uniforms.viewProjection*worldPos;
#include<clipPlaneVertex>
#include<fogVertex>
#include<vertexColorMixing>
#define CUSTOM_VERTEX_MAIN_END
}`;e.ShadersStoreWGSL[t]||(e.ShadersStoreWGSL[t]=n);var r={name:t,shader:n};export{r as t};
//# sourceMappingURL=color.vertex-CdoHOc6Y.js.map