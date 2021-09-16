const _ = require('lodash');
const JSZip = require('jszip');
const mime = require('mime-types');
const RawSource = require('webpack-sources').RawSource;

const zip = new JSZip();

module.exports = class OfflinePackagePlugin {
  constructor(options) {
    this.options = _.assign(
      {
        packageNameKey: 'packageName',
        packageNameValue: '',
        version: 1,
        folderName: 'package',
        indexFileName: 'index.json',
        baseUrl: '',
        fileTypes: [],
        excludeFileName: [],
        transformExtensions: /^(gz|map)$/i,
        serialize: (manifest) => {
          return JSON.stringify(manifest, null, 2);
        }
      },
      options
    );
  }

  getFileType(str) {
    str = str.replace(/\?.*/, '');
    const split = str.split('.');
    let ext = split.pop();
    if (this.options.transformExtensions.test(ext)) {
      ext = split.pop() + '.' + ext;
    }
    return ext;
  }
  //负责编译的Compiler和负责创建 bundles 的Compilation都是Tapable的实例
  apply(compiler) {
    // emit是编译完成，但是代码还没有输出到output文件夹的阶段
    compiler.hooks.emit.tapAsync(
      'OfflinePackagePlugin',
      (compilation, callback) => {
        const isFileTypeLimit = this.options.fileTypes.length > 0;

        // create index.json
        const content = {
          [this.options.packageNameKey]: this.options.packageNameValue,
          version: this.options.version,
          items: []
        };
        // 拿到所有的资源
        for (const filename in compilation.assets) {
          const fileType = this.getFileType(filename);

          if (this.options.excludeFileName.includes(filename)) {
            continue;
          }

          if (isFileTypeLimit && !this.options.fileTypes.includes(fileType)) {
            continue;
          }

          content.items.push({
            [this.options.packageNameKey]: this.options.packageNameValue,
            version: this.options.version,
            remoteUrl: this.options.baseUrl + filename,
            path: filename,
            mimeType: mime.lookup(fileType)
          });
        }
        // 将文件内容json写到传入的配置json文件
        const outputFile = this.options.serialize(content);
        compilation.assets[this.options.indexFileName] = {
          source: () => {
            return outputFile;
          },
          size: () => {
            return outputFile.length;
          }
        };

        // create zip file
        const folder = zip.folder(this.options.folderName);

        for (const filename in compilation.assets) {
          const fileType = this.getFileType(filename);

          if (this.options.excludeFileName.includes(filename)) {
            continue;
          }

          if (
            isFileTypeLimit &&
            !this.options.fileTypes.includes(fileType) &&
            filename !== this.options.indexFileName
          ) {
            continue;
          }
          // 拿到资源内容，写入zip里
          const source = compilation.assets[filename].source();
          folder.file(filename, source);
        }
        
        zip
          .generateAsync({
            type: 'nodebuffer',
            streamFiles: true,
            compression: 'DEFLATE',
            compressionOptions: { level: 9 }
          })
          .then((content) => {
            const outputPath = this.options.folderName + '.zip';
            compilation.assets[outputPath] = new RawSource(content);
            // 压缩完成，执行下一个流程
            callback();
          });
      }
    );
  }
};
