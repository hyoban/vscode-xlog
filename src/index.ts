import path from 'node:path'

import fm from 'front-matter'
import type { PostInput } from 'sakuin'
import { Client } from 'sakuin'
import * as vscode from 'vscode'
import { stringify } from 'yaml'

const client = new Client()

export function activate(extContext: vscode.ExtensionContext) {
  const logger = vscode.window.createOutputChannel('xLog')
  extContext.subscriptions.push(logger)

  // check configuration
  const configration = vscode.workspace.getConfiguration()
  const xLogToken = configration.get('xlog.token') as string | undefined
  const xLogHandle = configration.get('xlog.handle') as string | undefined
  const xLogPostFolder = configration.get('xlog.post-folder') as string | undefined

  if (!xLogToken || !xLogHandle || !xLogPostFolder) {
    logger.appendLine('xLog is not properly configured')
    return
  }

  const downloadHandler = async () => {
    vscode.window.showInformationMessage('Downloading posts from xLog')
    try {
      const posts = await client.post.getAll(xLogHandle, { raw: true })
      const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (!workspace)
        return
      const folder = path.join(workspace, xLogPostFolder)
      for (const post of posts) {
        const filename = path.join(folder, `${post.slug}.md`)
        const attributes = {
          title: post.title,
          datePublishedAt: post.datePublishedAt,
          summary: post.summary,
          slug: post.slug,
          disableAISummary: post.disableAISummary,
          cover: post.cover,
          tags: post.tags,
        }
        const fileContent = `---\n${stringify(attributes)}---\n\n${post.content}`
        await vscode.workspace.fs.writeFile(vscode.Uri.file(filename), Buffer.from(fileContent))
      }
    }
    catch (error) {
      if (error instanceof Error)
        logger.appendLine(`Error: ${error.message}`)
    }
    vscode.window.showInformationMessage('Posts downloaded from xLog')
  }

  const readEditorFile = async (editor: vscode.TextEditor) => {
    const filePath = editor.document.uri.fsPath
    const fileName = path.basename(filePath, '.md')
    const fileContent = editor.document.getText()
    const parsed = fm<Omit<Partial<PostInput>, 'cover'> & { cover?: string }>(fileContent)
    return { fileName, parsed }
  }

  const uploadHandler = async (editor: vscode.TextEditor) => {
    vscode.window.showInformationMessage('Creating post on xLog')
    try {
      const { fileName, parsed } = await readEditorFile(editor)
      logger.appendLine(JSON.stringify(parsed, null, 2))
      await client.post.put({
        token: xLogToken,
        handleOrCharacterId: xLogHandle,
        post: {
          content: parsed.body,
          slug: parsed.attributes.slug || fileName,
          title: parsed.attributes.title || 'Untitled',
          datePublishedAt: parsed.attributes.datePublishedAt || '',
          summary: parsed.attributes.summary || '',
          disableAISummary: parsed.attributes.disableAISummary || false,
          cover: parsed.attributes.cover || '',
          tags: parsed.attributes.tags || [],
        },
      })
      vscode.window.showInformationMessage('Created post on xLog')
    }
    catch (error) {
      logger.appendLine(String(error))
      vscode.window.showErrorMessage('Failed to create post on xLog')
    }
  }

  const updateHandler = async (editor: vscode.TextEditor) => {
    vscode.window.showInformationMessage('Updating post on xLog')
    try {
      const { fileName, parsed } = await readEditorFile(editor)
      logger.appendLine(JSON.stringify(parsed, null, 2))
      await client.post.update({
        handleOrCharacterId: xLogHandle,
        token: xLogToken,
        slug: parsed.attributes.slug || fileName,
        post: {
          ...parsed.attributes,
          content: parsed.body,
        },
      })
      vscode.window.showInformationMessage('Updated post on xLog')
    }
    catch (error) {
      logger.appendLine(String(error))
      vscode.window.showErrorMessage('Failed to update post on xLog')
    }
  }

  extContext.subscriptions.push(
    vscode.commands.registerCommand('xlog.download', downloadHandler),
    vscode.commands.registerTextEditorCommand('xlog.create', uploadHandler),
    vscode.commands.registerTextEditorCommand('xlog.update', updateHandler),
  )
}
