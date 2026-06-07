import{t as e}from"./shaderStore-DZjcEDJh.js";var t=`passPixelShader`,n=`varying vec2 vUV;uniform sampler2D textureSampler;
#define CUSTOM_FRAGMENT_DEFINITIONS
void main(void) 
{gl_FragColor=texture2D(textureSampler,vUV);}`;e.ShadersStore[t]||(e.ShadersStore[t]=n);var r={name:t,shader:n};export{r as t};
//# sourceMappingURL=pass.fragment-BZIyvU7m.js.map