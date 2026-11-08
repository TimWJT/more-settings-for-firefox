// Keep build tools and docs out of the packaged .xpi (the IP database build script stays in the source upload for AMO).
export default {
  ignoreFiles: ['tools', '*.md', 'web-ext-config.mjs', '.gitignore'],
};
