const Koa = require('koa')
const fs = require('fs')
const path = require('path')
const compilerSfc = require('@vue/compiler-sfc')
const compilerDom = require("@vue/compiler-dom");

function createServer() {
  const app = new Koa()
  
  app.use(ctx => {
    const url = ctx.url
    const query = ctx.query
    if(url === '/') {
      const html = fs.readFileSync('./index.html', 'utf-8')
      ctx.type = 'text/html'
      ctx.body = html
    } 
    // 处理js
    else if(url.endsWith('.js')) {
      const filePath = path.join(__dirname, url)
      const file = fs.readFileSync(filePath, 'utf-8')
      ctx.type = 'application/javascript'
      ctx.body = rewirteImport(file)
    }
    // 处理node_modules的引用
    else if(url.startsWith('/@modules/')) {
      ctx.type = "application/javascript"
      // 文件前缀, 去node_modules下去找
      const filePrefix = path.resolve(__dirname, 'node_modules', url.replace('/@modules/', ''))
      console.log(filePrefix, ">>>");
      // 获取npm包下面的package.json的module指向的文件
      const module = require(filePrefix + '/package.json').module
      const file = fs.readFileSync(filePrefix+'/'+module, 'utf-8')
      // 如果这个包里还引入了其他的包,嵌套引用, todo 但是pnpm的安装方式不是铺平的, 有可能有点问题.
      ctx.body = rewirteImport(file)
    }
    // 处理.vue文件
    else if(url.includes('.vue')) {
      // 获得绝对路径, url.slice(1)去掉第一个'/'
        // const filePath = path.resolve(__dirname, url.slice(1))
        const filePath = path.resolve(__dirname, url.slice(1).split("?")[0]);

      const { descriptor } = compilerSfc.parse(
        fs.readFileSync(filePath, "utf-8")
      )
      console.log('....template', query.type)

      if(!query.type) {
        const scriptContent = descriptor.script.content

        const script = scriptContent.replace('export default','const __script = ')
        ctx.type = 'text/javascript'
        ctx.body = `
        ${rewirteImport(script)}
        // 如果有style,请求style部分
        ${descriptor.styles.length ? `import "${url}?type=style"`: ''}
        // 请求template部分
        import { render as __render } from "${url}?type=template"
        __script.render = __render
        export default __script
        `
      } // 处理template
      else if(query.type === 'template') {
        const templateContent = descriptor.template.content
        const render = compilerDom.compile(templateContent, {
          mode: 'module'
        }).code
        ctx.type = "application/javascript"
        ctx.body = rewirteImport(render);
      }
      // 处理style
      else if(query.type === 'style') {
        const styleBlock = descriptor.styles[0]
        ctx.type = "application/javascript"
        ctx.body = `
          const css = ${JSON.stringify(styleBlock.content)}
          updateStyle(css);
          export default css;
        `
      }

    }

   
  })


  app.listen(3335, () => {
    console.log('服务启动在3335端口')
  })
}

// 裸模块替换

function rewirteImport(content) {
  return content.replace(/ from ['"](.*)['"]/g, (s1, s2) => {
    if(s2.startsWith('./') || s2.startsWith('/') || s2.startsWith('../')) {
      // 使用的是相对路径,直接返回
      return s1
    } else {
      return ` from "/@modules/${s2}"`
    }
  })
}


createServer()