import{t as e}from"./shaderStore-Dw977DTa.js";import"./clipPlaneFragmentDeclaration-B1azhEJc.js";import"./clipPlaneFragment-CGyUD0Zd.js";import"./logDepthDeclaration-Bchv1FGt.js";import"./fogFragmentDeclaration-QYXFhRxV.js";import"./logDepthFragment-CAb67byh.js";import"./fogFragment-DHsBd1GN.js";var t=`gaussianSplattingFragmentDeclaration`,n=`vec4 gaussianColor(vec4 inColor)
{float A=-dot(vPosition,vPosition);if (A<-4.0) discard;float B=exp(A)*inColor.a;
#include<logDepthFragment>
vec3 color=inColor.rgb;
#ifdef FOG
#include<fogFragment>
#endif
return vec4(color,B);}
`;e.IncludesShadersStore[t]||(e.IncludesShadersStore[t]=n);var r=`gaussianSplattingPixelShader`,i=`#include<clipPlaneFragmentDeclaration>
#include<logDepthDeclaration>
#include<fogFragmentDeclaration>
varying vec4 vColor;varying vec2 vPosition;
#include<gaussianSplattingFragmentDeclaration>
void main () { 
#include<clipPlaneFragment>
gl_FragColor=gaussianColor(vColor);}
`;e.ShadersStore[r]||(e.ShadersStore[r]=i);var a={name:r,shader:i};export{a as t};
//# sourceMappingURL=gaussianSplatting.fragment-COGKWM4b.js.map