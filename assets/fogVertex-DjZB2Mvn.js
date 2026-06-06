import{t as e}from"./shaderStore-Dw977DTa.js";var t=`fogVertex`,n=`#ifdef FOG
#ifdef SCENE_UBO
vertexOutputs.vFogDistance=(scene.view*worldPos).xyz;
#else
vertexOutputs.vFogDistance=(uniforms.view*worldPos).xyz;
#endif
#endif
`;e.IncludesShadersStoreWGSL[t]||(e.IncludesShadersStoreWGSL[t]=n);
//# sourceMappingURL=fogVertex-DjZB2Mvn.js.map