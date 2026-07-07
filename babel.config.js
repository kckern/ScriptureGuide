// Env-aware: webpack build keeps ES modules (modules:false) for tree-shaking;
// jest (NODE_ENV=test) transforms to CommonJS so import/export work under node.
module.exports = (api) => {
  const isTest = api.env('test');
  return {
    presets: [
      ['@babel/preset-env', {
        targets: isTest ? { node: 'current' } : { chrome: '88' },
        modules: isTest ? 'commonjs' : false
      }]
    ]
  };
};
