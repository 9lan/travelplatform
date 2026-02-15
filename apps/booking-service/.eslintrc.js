module.exports = {
  root: true,
  extends: ["@travelplatform/eslint-config"],
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
  },
};
