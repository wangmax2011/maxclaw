# MaxClaw Template System (E9)

项目模板/脚手架系统实现文档。

## 功能概述

MaxClaw 模板系统允许用户快速创建标准化的项目结构，支持多种预定义模板和自定义模板。

## 目录结构

```
src/
├── template-engine.ts      # 模板引擎核心逻辑
├── template-manager.ts     # 模板管理 CLI 支持
├── templates/              # 内置模板目录
│   ├── nodejs-ts/         # Node.js + TypeScript 模板
│   ├── react-app/         # React + Vite 模板
│   ├── nextjs/            # Next.js 模板
│   └── python/            # Python 模板
└── __tests__/
    └── template-engine.test.ts  # 测试文件
```

## CLI 命令

### 列出可用模板

```bash
maxclaw template list
```

输出示例：
```
📁 Available Templates:

  📦 nodejs-ts v1.0.0
     Node.js + TypeScript project template
     Source: builtin

  📦 react-app v1.0.0
     React application template with Vite
     Source: builtin

  📦 nextjs v1.0.0
     Next.js application template with App Router
     Source: builtin

  📦 python v1.0.0
     Python project template with modern tooling
     Source: builtin
```

### 使用模板创建项目

```bash
maxclaw template use <template> <path> [options]
```

选项：
- `-n, --name <name>` - 项目名称（默认使用目录名）
- `-a, --author <author>` - 作者名
- `-d, --description <desc>` - 项目描述
- `--no-git` - 跳过 git 初始化
- `--no-register` - 跳过注册到 MaxClaw
- `--install-deps` - 创建后安装依赖

示例：
```bash
# 创建 Node.js + TypeScript 项目
maxclaw template use nodejs-ts ./my-project --name="my-project"

# 创建 React 项目并安装依赖
maxclaw template use react-app ./my-app --install-deps

# 创建 Python 项目，指定作者
maxclaw template use python ./my-python-project --author="Your Name"
```

### 查看模板详情

```bash
maxclaw template info <template>
```

示例：
```bash
maxclaw template info nodejs-ts
```

### 创建自定义模板

```bash
maxclaw template create <name> [options]
```

选项：
- `-d, --description <desc>` - 模板描述
- `-t, --type <type>` - 基于某个内置模板创建（nodejs-ts, react-app, nextjs, python, empty）

示例：
```bash
# 创建空模板
maxclaw template create my-template

# 基于 nodejs-ts 模板创建自定义模板
maxclaw template create my-node-template --type=nodejs-ts
```

### 删除自定义模板

```bash
maxclaw template delete <name> [-y]
```

选项：
- `-y, --yes` - 跳过确认

### 打开自定义模板目录

```bash
maxclaw template open-dir
```

## 模板格式

### template.yaml

每个模板必须包含 `template.yaml` 配置文件：

```yaml
name: nodejs-ts
version: 1.0.0
description: Node.js + TypeScript project template
author: MaxClaw

variables:
  - name: project_name
    description: Project name
    required: true
  - name: author
    description: Author name
    default: ""
  - name: description
    description: Project description
    default: "A project"

dependencies:
  npm:
    - typescript
    - "@types/node"
    - tsx

gitignore:
  - node_modules/
  - dist/
  - .env
  - "*.log"

postInstall: []
```

### 变量替换

模板文件中可以使用 `{{variable}}` 语法进行变量替换：

内置变量：
- `{{project_name}}` - 项目名称
- `{{project_name_kebab}}` - 短横线格式（my-project）
- `{{project_name_camel}}` - 驼峰格式（myProject）
- `{{project_name_pascal}}` - 帕斯卡格式（MyProject）
- `{{author}}` - 作者名
- `{{date}}` - 创建日期
- `{{description}}` - 项目描述

示例（package.json）：
```json
{
  "name": "{{project_name_kebab}}",
  "version": "1.0.0",
  "author": "{{author}}",
  "description": "{{description}}"
}
```

### 目录名变量

模板支持在目录名中使用变量，例如 Python 模板：

```
python/
├── src/
│   └── {{project_name_kebab}}/
│       ├── __init__.py
│       └── __main__.py
└── tests/
    └── __init__.py
```

创建项目时会自动替换为实际项目名称。

## 自定义模板

自定义模板存储在 `~/.maxclaw/templates/` 目录中。

### 创建自定义模板步骤

1. 使用 CLI 创建模板骨架：
   ```bash
   maxclaw template create my-template --description="My custom template"
   ```

2. 编辑 `~/.maxclaw/templates/my-template/template.yaml`

3. 添加模板文件到 `~/.maxclaw/templates/my-template/`

4. 测试模板：
   ```bash
   maxclaw template use my-template ./test-project
   ```

## API 参考

### Template Engine

```typescript
// 处理模板
processTemplate(
  templateDir: string,
  options: TemplateOptions
): Promise<TemplateResult>

// 列出可用模板
listAvailableTemplates(): Array<{
  name: string;
  version: string;
  description: string;
  source: 'builtin' | 'custom';
}>

// 获取模板目录
getTemplateDirByName(templateName: string): string | null
```

### Template Manager

```typescript
// 创建项目
createProject(
  templateName: string,
  targetPath: string,
  options: {...}
): Promise<TemplateResult>

// 创建自定义模板
createTemplate(
  templateName: string,
  options: {...}
): Promise<{ success: boolean; templatePath: string; errors: string[] }>

// 列出模板
listTemplates(): TemplateInfo[]

// 显示模板详情
showTemplateDetails(templateName: string): {...}
```

## 测试

运行模板引擎测试：

```bash
npm test -- src/__tests__/template-engine.test.ts
```

## 验收标准

- [x] `maxclaw template list` 显示所有模板
- [x] `maxclaw template use nodejs-ts ./my-project --name="my-project"` 创建项目
- [x] 创建后自动注册到 MaxClaw
- [x] 支持自定义模板（`~/.maxclaw/templates/`）
- [x] 所有测试通过（25 个测试）

## 技术实现

### 变量替换
使用正则表达式 `/\{\{(\w+)\}\}/g` 匹配并替换变量。

### 文件复制
递归复制模板目录，支持：
- 目录名变量替换
- 文件内容变量替换
- 条件渲染（根据配置包含/排除文件）
- 跳过二进制文件的变量替换

### Git 集成
- 自动初始化 git 仓库
- 自动生成 .gitignore 文件

### MaxClaw 集成
- 创建后自动注册项目到 MaxClaw 数据库
- 项目立即可用 `maxclaw start` 命令启动
