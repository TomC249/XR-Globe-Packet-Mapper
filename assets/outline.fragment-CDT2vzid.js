import{t as e}from"./shaderStore-DZjcEDJh.js";import"./clipPlaneFragmentDeclaration-CAANW5XD.js";import"./clipPlaneFragment-CfCuQehH.js";import"./logDepthDeclaration-BcOMjcfh.js";import"./logDepthFragment-DWTKEUQy.js";var t=`outlinePixelShader`,n=`#ifdef LOGARITHMICDEPTH
#extension GL_EXT_frag_depth : enable
#endif
uniform vec4 color;
#ifdef ALPHATEST
varying vec2 vUV;uniform sampler2D diffuseSampler;
#endif
#include<clipPlaneFragmentDeclaration>
#include<logDepthDeclaration>
#define CUSTOM_FRAGMENT_DEFINITIONS
void main(void) {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
#include<clipPlaneFragment>
#ifdef ALPHATEST
if (texture2D(diffuseSampler,vUV).a<0.4)
discard;
#endif
#include<logDepthFragment>
gl_FragColor=color;
#define CUSTOM_FRAGMENT_MAIN_END
}`;e.ShadersStore[t]||(e.ShadersStore[t]=n);var r={name:t,shader:n};export{r as t};
//# sourceMappingURL=outline.fragment-CDT2vzid.js.map