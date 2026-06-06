import{t as e}from"./shaderStore-Dw977DTa.js";import"./boundingBoxRendererUboDeclaration--EI4aUHz.js";var t=`boundingBoxRendererFragmentDeclaration`,n=`uniform vec4 color;
`;e.IncludesShadersStore[t]||(e.IncludesShadersStore[t]=n);var r=`boundingBoxRendererPixelShader`,i=`#include<__decl__boundingBoxRendererFragment>
#define CUSTOM_FRAGMENT_DEFINITIONS
void main(void) {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
gl_FragColor=color;
#define CUSTOM_FRAGMENT_MAIN_END
}`;e.ShadersStore[r]||(e.ShadersStore[r]=i);var a={name:r,shader:i};export{a as t};
//# sourceMappingURL=boundingBoxRenderer.fragment-Tdteahum.js.map