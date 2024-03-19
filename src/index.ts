import fs from 'node:fs/promises'
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

  const getConfiguration = (isWrite: boolean) => {
    // check configuration
    const configuration = vscode.workspace.getConfiguration()
    const xLogToken = configuration.get('xlog.token') as string
    const xLogHandle = configuration.get('xlog.handle') as string
    const xLogPostFolder = configuration.get('xlog.post-folder') as string

    if (isWrite && !xLogToken) {
      vscode.window.showErrorMessage('xLog token is not set')
      return
    }

    if (!xLogHandle) {
      vscode.window.showErrorMessage('xLog handle is not set')
      return
    }

    if (!xLogPostFolder) {
      vscode.window.showErrorMessage('xLog post folder is not set')
      return
    }

    return { xLogToken, xLogHandle, xLogPostFolder }
  }

  const downloadHandler = async () => {
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Downloading posts from xLog',
        cancellable: false,
      },
      async (progress) => {
        try {
          const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
          if (!workspace)
            return
          const configuration = getConfiguration(false)
          if (!configuration)
            return
          const { xLogHandle, xLogPostFolder } = configuration
          progress.report({ message: 'fetching', increment: 0 })
          let { list: posts, count, cursor } = await client.post.getMany(xLogHandle, { raw: true })
          do {
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
              progress.report({
                message: post.title,
                increment: 100 / count,
              })
            }
            if (cursor) {
              ({ list: posts, count, cursor } = await client.post.getMany(xLogHandle, { cursor, raw: true }))
              progress.report({ message: 'fetching', increment: 0 })
            }
          } while (cursor)
        }
        catch (error) {
          if (error instanceof Error)
            logger.appendLine(`Error: ${error.message}`)
        }
        vscode.window.showInformationMessage('Posts downloaded from xLog')
      },
    )
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
      const configuration = getConfiguration(true)
      if (!configuration)
        return
      const { xLogHandle, xLogToken } = configuration
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
      const configuration = getConfiguration(true)
      if (!configuration)
        return
      const { xLogHandle, xLogToken } = configuration
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
    vscode.commands.registerCommand('xlog.uploadFile', async (uri: vscode.Uri) => {
      vscode.window.showInformationMessage(`Start uploading file ${path.basename(uri.fsPath)}`)
      logger.appendLine(`Uploading file: ${uri.fsPath}`)
      const fileContent = await fs.readFile(uri.fsPath, { encoding: null })
      const result = await client.uploadFile(new Blob([fileContent]))
      logger.appendLine(JSON.stringify(result, null, 2))
      vscode.env.clipboard.writeText(result.web2url)
      vscode.window.showInformationMessage(`File uploaded, URL copied to clipboard`)
    }),
  )
}
