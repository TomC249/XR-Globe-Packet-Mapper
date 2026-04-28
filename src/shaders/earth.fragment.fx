precision highp float;

// Varyings
varying vec3 vPosition;
varying vec3 vNormal;
varying vec2 vUv;

// Uniforms
uniform sampler2D diffuseTexture;
uniform sampler2D bumpTexture;
uniform sampler2D specularTexture;
uniform vec3 lightDirection0;
uniform vec3 lightDiffuse0;
uniform vec3 vLightSpecular0;
uniform vec3 vAmbientColor;

void main() {
  vec3 texColor = texture2D(diffuseTexture, vUv).rgb;

  // Simple diffuse lighting
  vec3 N = normalize(-vNormal);
  float diffuse = max(dot(N, lightDirection0), 0.0);

  // Specular from texture
  vec3 specColor = texture2D(specularTexture, vUv).rgb;

  // Combine lighting - ensure full opacity and solid color
  vec3 ambient = vAmbientColor * 0.8;
  vec3 diffuseLight = texColor * (ambient + lightDiffuse0 * diffuse * 1.2);
  vec3 specLight = specColor * vLightSpecular0 * diffuse * 0.5;

  gl_FragColor = vec4(diffuseLight + specLight, 1.0);
}


