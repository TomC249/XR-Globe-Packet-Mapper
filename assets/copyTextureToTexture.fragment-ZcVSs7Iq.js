import{t as e}from"./shaderStore-DZjcEDJh.js";import"./helperFunctions-BAm9aq7c.js";var t=`copyTextureToTexturePixelShader`,n=`uniform float conversion;uniform sampler2D textureSampler;varying vec2 vUV;
#include<helperFunctions>
void main(void) 
{vec4 color=texture2D(textureSampler,vUV);
#ifdef DEPTH_TEXTURE
gl_FragDepth=color.r;
#else
if (conversion==1.) {color=toLinearSpace(color);} else if (conversion==2.) {color=toGammaSpace(color);}
gl_FragColor=color;
#endif
}
`;e.ShadersStore[t]||(e.ShadersStore[t]=n);var r={name:t,shader:n};export{r as t};
//# sourceMappingURL=copyTextureToTexture.fragment-ZcVSs7Iq.js.map