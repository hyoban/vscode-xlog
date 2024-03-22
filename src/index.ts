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

  const readEditorFile = async (editor: vscode.TextEditor, uri?: vscode.Uri) => {
    const filePath = uri?.fsPath || editor.document.uri.fsPath
    // eslint-disable-next-line github/no-then
    const isFile = await fs.stat(filePath).then(stat => stat.isFile()).catch(() => false)
    if (!isFile) {
      vscode.window.showErrorMessage(`Cannot read file: ${filePath}`)
      return
    }
    const fileName = path.basename(filePath, '.md')
    const fileContent = editor.document.getText()
    const parsed = fm<Omit<Partial<PostInput>, 'cover'> & { cover?: string }>(fileContent)
    return { fileName, parsed }
  }

  const uploadHandler = async (
    editor: vscode.TextEditor,
    _edit: vscode.TextEditorEdit,
    uri: vscode.Uri,
  ) => {
    try {
      const configuration = getConfiguration(true)
      if (!configuration)
        return
      const { xLogHandle, xLogToken } = configuration
      const file = await readEditorFile(editor, uri)
      if (!file)
        return
      vscode.window.showInformationMessage('Creating post on xLog')
      const { fileName, parsed } = file
      logger.appendLine(JSON.stringify(parsed, null, 2))
      await client.post.put({
        token: xLogToken,
        handleOrCharacterId: xLogHandle,
        note: {
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

  const updateHandler = async (
    editor: vscode.TextEditor,
    _edit: vscode.TextEditorEdit,
    uri: vscode.Uri,
  ) => {
    try {
      const configuration = getConfiguration(true)
      if (!configuration)
        return
      const { xLogHandle, xLogToken } = configuration
      const file = await readEditorFile(editor, uri)
      if (!file)
        return
      vscode.window.showInformationMessage('Updating post on xLog')
      const { fileName, parsed } = file
      logger.appendLine(JSON.stringify(parsed, null, 2))
      await client.post.update({
        handleOrCharacterId: xLogHandle,
        token: xLogToken,
        slug: parsed.attributes.slug || fileName,
        note: {
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
      try {
        const fileContent = await fs.readFile(uri.fsPath, { encoding: null })
        const result = await client.uploadFile(new Blob([fileContent]))
        logger.appendLine(JSON.stringify(result, null, 2))
        vscode.env.clipboard.writeText(result.web2url)
        vscode.window.showInformationMessage(`File uploaded, URL copied to clipboard`)
      }
      catch (error) {
        logger.appendLine(String(error))
        vscode.window.showErrorMessage('Failed to upload file')
      }
    }),
    vscode.commands.registerTextEditorCommand(
      'xlog.uploadFileFromUrl',
      async (editor) => {
        const { selection } = editor
        const selectedText = editor.document.getText(selection)
        if (!selectedText || !selectedText.startsWith('http')) {
          vscode.window.showErrorMessage('No URL selected')
          return
        }

        vscode.window.showInformationMessage('Uploading file from URL')
        logger.appendLine(`Uploading file from URL: ${selectedText}`)

        try {
          const result = await client.uploadFileFromUrl([selectedText])
          logger.appendLine(JSON.stringify(result, null, 2))
          vscode.env.clipboard.writeText(result.at(0)!.web2url)
          vscode.window.showInformationMessage(`File uploaded, URL copied to clipboard`)
        }
        catch (error) {
          logger.appendLine(String(error))
          vscode.window.showErrorMessage('Failed to upload file from URL')
        }
      },
    ),
  )
}
