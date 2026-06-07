import{t as e}from"./shaderStore-DZjcEDJh.js";import"./clipPlaneFragmentDeclaration-BJnxRo6J.js";import"./clipPlaneFragment-IU9XYTG2.js";import"./logDepthDeclaration-DewWwhww.js";import"./fogFragmentDeclaration-C19_y4g-.js";import"./logDepthFragment-DevqAfKc.js";import"./fogFragment-FHisueO1.js";var t=`gaussianSplattingFragmentDeclaration`,n=`fn gaussianColor(inColor: vec4f,inPosition: vec2f)->vec4f
{var A : f32=-dot(inPosition,inPosition);if (A>-4.0)
{var B: f32=exp(A)*inColor.a;
#include<logDepthFragment>
var color: vec3f=inColor.rgb;
#ifdef FOG
#include<fogFragment>
#endif
return vec4f(color,B);} else {return vec4f(0.0);}}
`;e.IncludesShadersStoreWGSL[t]||(e.IncludesShadersStoreWGSL[t]=n);var r=`gaussianSplattingPixelShader`,i=`#include<clipPlaneFragmentDeclaration>
#include<logDepthDeclaration>
#include<fogFragmentDeclaration>
varying vColor: vec4f;varying vPosition: vec2f;
#include<gaussianSplattingFragmentDeclaration>
@fragment
fn main(input: FragmentInputs)->FragmentOutputs {
#include<clipPlaneFragment>
fragmentOutputs.color=gaussianColor(input.vColor,input.vPosition);}
`;e.ShadersStoreWGSL[r]||(e.ShadersStoreWGSL[r]=i);var a={name:r,shader:i};export{a as t};
//# sourceMappingURL=gaussianSplatting.fragment-DvFwL-7J.js.map