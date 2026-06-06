import{t as e}from"./shaderStore-Dw977DTa.js";var t=`logDepthVertex`,n=`#ifdef LOGARITHMICDEPTH
vertexOutputs.vFragmentDepth=1.0+vertexOutputs.position.w;vertexOutputs.position.z=log2(max(0.000001,vertexOutputs.vFragmentDepth))*uniforms.logarithmicDepthConstant;
#endif
`;e.IncludesShadersStoreWGSL[t]||(e.IncludesShadersStoreWGSL[t]=n);
//# sourceMappingURL=logDepthVertex-3kWBeO_F.js.map