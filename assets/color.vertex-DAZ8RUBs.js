import{t as e}from"./shaderStore-Dw977DTa.js";import"./bonesDeclaration-DCsTCT-9.js";import"./bakedVertexAnimation-Dfq0IhE-.js";import"./instancesDeclaration-CZ2gULKv.js";import"./instancesVertex-wigqid0_.js";import"./bonesVertex-DRkK2fhy.js";import"./clipPlaneVertexDeclaration-BXjRNxlA.js";import"./clipPlaneVertex-D2xAHe_s.js";import"./fogVertexDeclaration-CBHp9Z7g.js";import"./fogVertex-Dv3w70Yr.js";import"./vertexColorMixing-B7z1-OBU.js";var t=`colorVertexShader`,n=`attribute vec3 position;
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
//# sourceMappingURL=color.vertex-DAZ8RUBs.js.map