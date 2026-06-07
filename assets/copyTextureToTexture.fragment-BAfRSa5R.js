import{t as e}from"./shaderStore-DZjcEDJh.js";import"./helperFunctions-DbfHdnYV.js";var t=`copyTextureToTexturePixelShader`,n=`uniform conversion: f32;var textureSamplerSampler: sampler;var textureSampler: texture_2d<f32>;varying vUV: vec2f;
#include<helperFunctions>
@fragment
fn main(input: FragmentInputs)->FragmentOutputs {var color: vec4f=textureSample(textureSampler,textureSamplerSampler,input.vUV);
#ifdef DEPTH_TEXTURE
fragmentOutputs.fragDepth=color.r;
#else
if (uniforms.conversion==1.) {color=toLinearSpaceVec4(color);} else if (uniforms.conversion==2.) {color=toGammaSpace(color);}
fragmentOutputs.color=color;
#endif
}
`;e.ShadersStoreWGSL[t]||(e.ShadersStoreWGSL[t]=n);var r={name:t,shader:n};export{r as t};
//# sourceMappingURL=copyTextureToTexture.fragment-BAfRSa5R.js.map