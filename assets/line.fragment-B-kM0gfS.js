import{t as e}from"./shaderStore-DZjcEDJh.js";import"./clipPlaneFragmentDeclaration-CAANW5XD.js";import"./clipPlaneFragment-CfCuQehH.js";import"./logDepthDeclaration-BcOMjcfh.js";import"./logDepthFragment-DWTKEUQy.js";var t=`linePixelShader`,n=`#include<clipPlaneFragmentDeclaration>
uniform vec4 color;
#ifdef LOGARITHMICDEPTH
#extension GL_EXT_frag_depth : enable
#endif
#include<logDepthDeclaration>
#define CUSTOM_FRAGMENT_DEFINITIONS
void main(void) {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
#include<logDepthFragment>
#include<clipPlaneFragment>
gl_FragColor=color;
#define CUSTOM_FRAGMENT_MAIN_END
}`;e.ShadersStore[t]||(e.ShadersStore[t]=n);var r={name:t,shader:n};export{r as t};
//# sourceMappingURL=line.fragment-B-kM0gfS.js.map