import{t as e}from"./shaderStore-Dw977DTa.js";import"./clipPlaneFragmentDeclaration-Xvn7OB1p.js";import"./clipPlaneFragment-CVBfqn1N.js";import"./logDepthDeclaration-BI2GPZxE.js";import"./fogFragmentDeclaration-bevVmJH2.js";import"./logDepthFragment-CY-EhT5J.js";import"./fogFragment-DKDJXo0_.js";var t=`gaussianSplattingFragmentDeclaration`,n=`fn gaussianColor(inColor: vec4f,inPosition: vec2f)->vec4f
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
//# sourceMappingURL=gaussianSplatting.fragment-CQGBIjXF.js.map