import{t as e}from"./shaderStore-DZjcEDJh.js";import"./helperFunctions-DbfHdnYV.js";import"./hdrFilteringFunctions-BkUgcjRZ.js";import"./pbrBRDFFunctions-hQTEXrFR.js";var t=`hdrFilteringPixelShader`,n=`#include<helperFunctions>
#include<importanceSampling>
#include<pbrBRDFFunctions>
#include<hdrFilteringFunctions>
uniform alphaG: f32;var inputTextureSampler: sampler;var inputTexture: texture_cube<f32>;uniform vFilteringInfo: vec2f;uniform hdrScale: f32;varying direction: vec3f;@fragment
fn main(input: FragmentInputs)->FragmentOutputs {var color: vec3f=radiance(uniforms.alphaG,inputTexture,inputTextureSampler,input.direction,uniforms.vFilteringInfo);fragmentOutputs.color= vec4f(color*uniforms.hdrScale,1.0);}`;e.ShadersStoreWGSL[t]||(e.ShadersStoreWGSL[t]=n);var r={name:t,shader:n};export{r as t};
//# sourceMappingURL=hdrFiltering.fragment-O_U0xvMB.js.map