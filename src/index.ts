import path from 'node:path'

import fm from 'front-matter'
import type { PostInput } from 'sakuin'
import { Client } from 'sakuin'
import * as vscode from 'vscode'

const client = new Client({ xLogBase: 'xlog.page' })

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
      const posts = await client.post.getAll(xLogHandle, { convertUrlToGateway: false })
      const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (!workspace)
        return
      const folder = path.join(workspace, xLogPostFolder)
      for (const post of posts) {
        const filename = path.join(folder, `${post.slug}.md`)
        let fileContent = '---\n'
        fileContent += `title: ${post.title}\n`
        fileContent += `datePublishedAt: ${post.datePublishedAt}\n`
        fileContent += `summary: ${post.summary}\n`
        fileContent += `slug: ${post.slug}\n`
        fileContent += `disableAISummary: ${post.disableAISummary}\n`
        fileContent += `cover: ${post.cover?.address ?? ''}\n`
        fileContent += 'tags:\n'
        for (const tag of post.tags)
          fileContent += `  - ${tag}\n`
        fileContent += '---\n\n'
        fileContent += post.content
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
      await client.post.put(xLogToken, xLogHandle, {
        content: parsed.body,
        slug: parsed.attributes.slug || fileName,
        title: parsed.attributes.title || 'Untitled',
        datePublishedAt: parsed.attributes.datePublishedAt || '',
        summary: parsed.attributes.summary || '',
        disableAISummary: parsed.attributes.disableAISummary || false,
        cover: {
          address: parsed.attributes.cover || '',
        },
        tags: parsed.attributes.tags || [],
      })
    }
    catch (error) {
      if (error instanceof Error)
        logger.appendLine(`Error: ${error.message}`)
    }
    vscode.window.showInformationMessage('Created post on xLog')
  }

  const updateHandler = async (editor: vscode.TextEditor) => {
    vscode.window.showInformationMessage('Updating post on xLog')
    try {
      const { fileName, parsed } = await readEditorFile(editor)
      const slug = parsed.attributes.slug || fileName
      const post = await client.post.getBySlug(xLogHandle, slug)
      if (!post)
        return vscode.window.showErrorMessage('Post not found on xLog')

      const contentToUpdate = post
      if (parsed.attributes.title)
        contentToUpdate.title = parsed.attributes.title
      if (parsed.attributes.datePublishedAt)
        contentToUpdate.datePublishedAt = parsed.attributes.datePublishedAt
      if (parsed.attributes.summary)
        contentToUpdate.summary = parsed.attributes.summary
      if (parsed.attributes.disableAISummary)
        contentToUpdate.disableAISummary = parsed.attributes.disableAISummary
      if (parsed.attributes.cover)
        contentToUpdate.cover = { address: parsed.attributes.cover }
      if (parsed.attributes.tags)
        contentToUpdate.tags = parsed.attributes.tags
      if (parsed.body)
        contentToUpdate.content = parsed.body

      await client.post.update(
        xLogToken,
        xLogHandle,
        post.noteId,
        contentToUpdate,
      )
    }
    catch (error) {
      if (error instanceof Error)
        logger.appendLine(`Error: ${error.message}`)
    }
    vscode.window.showInformationMessage('Updated post on xLog')
  }

  extContext.subscriptions.push(
    vscode.commands.registerCommand('xlog.download', downloadHandler),
    vscode.commands.registerTextEditorCommand('xlog.create', uploadHandler),
    vscode.commands.registerTextEditorCommand('xlog.update', updateHandler),
  )
}
