import{t as e}from"./shaderStore-Dw977DTa.js";var t=`logDepthFragment`,n=`#ifdef LOGARITHMICDEPTH
fragmentOutputs.fragDepth=log2(fragmentInputs.vFragmentDepth)*uniforms.logarithmicDepthConstant*0.5;
#endif
`;e.IncludesShadersStoreWGSL[t]||(e.IncludesShadersStoreWGSL[t]=n);
//# sourceMappingURL=logDepthFragment-CY-EhT5J.js.map