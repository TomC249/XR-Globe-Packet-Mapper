import{t as e}from"./shaderStore-DZjcEDJh.js";var t=`boundingBoxRendererPixelShader`,n=`uniform color: vec4f;
#define CUSTOM_FRAGMENT_DEFINITIONS
@fragment
fn main(input: FragmentInputs)->FragmentOutputs {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
fragmentOutputs.color=uniforms.color;
#define CUSTOM_FRAGMENT_MAIN_END
}`;e.ShadersStoreWGSL[t]||(e.ShadersStoreWGSL[t]=n);var r={name:t,shader:n};export{r as t};
//# sourceMappingURL=boundingBoxRenderer.fragment-Qf5-JD2V.js.map