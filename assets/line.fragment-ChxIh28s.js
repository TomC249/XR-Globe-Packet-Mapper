import{t as e}from"./shaderStore-Dw977DTa.js";import"./clipPlaneFragmentDeclaration-Xvn7OB1p.js";import"./clipPlaneFragment-CVBfqn1N.js";import"./logDepthDeclaration-BI2GPZxE.js";import"./logDepthFragment-CY-EhT5J.js";var t=`linePixelShader`,n=`#include<clipPlaneFragmentDeclaration>
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
//# sourceMappingURL=line.fragment-ChxIh28s.js.map