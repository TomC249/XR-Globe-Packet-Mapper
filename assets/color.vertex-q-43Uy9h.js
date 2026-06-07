import{t as e}from"./shaderStore-DZjcEDJh.js";import"./bonesDeclaration-UJJpnNV4.js";import"./bakedVertexAnimation-Bzbmmqg6.js";import"./instancesDeclaration-2cBhRrfU.js";import"./instancesVertex-BqPqWbqK.js";import"./bonesVertex-DY73zrMX.js";import"./clipPlaneVertexDeclaration-DGXX8QeY.js";import"./clipPlaneVertex-bgd5rCvN.js";import"./fogVertexDeclaration-hH6zJkJ6.js";import"./fogVertex-XAydmYnt.js";import"./vertexColorMixing-CniLT05P.js";var t=`colorVertexShader`,n=`attribute vec3 position;
#ifdef VERTEXCOLOR
attribute vec4 color;
#endif
#include<bonesDeclaration>
#include<bakedVertexAnimationDeclaration>
#include<clipPlaneVertexDeclaration>
#include<fogVertexDeclaration>
#ifdef FOG
uniform mat4 view;
#endif
#include<instancesDeclaration>
uniform mat4 viewProjection;
#ifdef MULTIVIEW
uniform mat4 viewProjectionR;
#endif
#if defined(VERTEXCOLOR) || defined(INSTANCESCOLOR) && defined(INSTANCES)
varying vec4 vColor;
#endif
#define CUSTOM_VERTEX_DEFINITIONS
void main(void) {
#define CUSTOM_VERTEX_MAIN_BEGIN
#ifdef VERTEXCOLOR
vec4 colorUpdated=color;
#endif
#include<instancesVertex>
#include<bonesVertex>
#include<bakedVertexAnimation>
vec4 worldPos=finalWorld*vec4(position,1.0);
#ifdef MULTIVIEW
if (gl_ViewID_OVR==0u) {gl_Position=viewProjection*worldPos;} else {gl_Position=viewProjectionR*worldPos;}
#else
gl_Position=viewProjection*worldPos;
#endif
#include<clipPlaneVertex>
#include<fogVertex>
#include<vertexColorMixing>
#define CUSTOM_VERTEX_MAIN_END
}`;e.ShadersStore[t]||(e.ShadersStore[t]=n);var r={name:t,shader:n};export{r as t};
//# sourceMappingURL=color.vertex-q-43Uy9h.js.map