import{t as e}from"./shaderStore-DZjcEDJh.js";import"./clipPlaneFragmentDeclaration-BJnxRo6J.js";import"./clipPlaneFragment-IU9XYTG2.js";import"./logDepthDeclaration-DewWwhww.js";import"./logDepthFragment-DevqAfKc.js";var t=`linePixelShader`,n=`#include<clipPlaneFragmentDeclaration>
uniform color: vec4f;
#include<logDepthDeclaration>
#define CUSTOM_FRAGMENT_DEFINITIONS
@fragment
fn main(input: FragmentInputs)->FragmentOutputs {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
#include<logDepthFragment>
#include<clipPlaneFragment>
fragmentOutputs.color=uniforms.color;
#define CUSTOM_FRAGMENT_MAIN_END
}`;e.ShadersStoreWGSL[t]||(e.ShadersStoreWGSL[t]=n);var r={name:t,shader:n};export{r as t};
//# sourceMappingURL=line.fragment-DJ5aeLuA.js.map