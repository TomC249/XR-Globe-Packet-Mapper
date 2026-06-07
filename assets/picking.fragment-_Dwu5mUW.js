import{t as e}from"./shaderStore-DZjcEDJh.js";var t=`pickingPixelShader`,n=`#if defined(INSTANCES)
varying vec4 vMeshID;
#else
uniform vec4 meshID;
#endif
void main(void) {
#if defined(INSTANCES)
gl_FragColor=vMeshID;
#else
gl_FragColor=meshID;
#endif
}`;e.ShadersStore[t]||(e.ShadersStore[t]=n);var r={name:t,shader:n};export{r as t};
//# sourceMappingURL=picking.fragment-_Dwu5mUW.js.map