import{t as e}from"./shaderStore-Dw977DTa.js";import"./clipPlaneFragmentDeclaration-B1azhEJc.js";import"./clipPlaneFragment-CGyUD0Zd.js";import"./logDepthDeclaration-Bchv1FGt.js";import"./logDepthFragment-CAb67byh.js";var t=`linePixelShader`,n=`#include<clipPlaneFragmentDeclaration>
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
//# sourceMappingURL=line.fragment-B5xIn-HD.js.map