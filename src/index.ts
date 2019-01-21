import Octokit from '@octokit/rest'
import Humanize from 'humanize-plus'
import { Application, Context } from 'probot' // eslint-disable-line no-unused-vars

interface Config {
  recipients: string[]
}

export = (app: Application) => {
  app.on(['pull_request.opened', 'pull_request.edited'], (context: Context) => {
    return handlePullRequest(context)
  })
  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
}

async function handlePullRequest(context: Context) {
  const { github, payload } = context
  const { pull_request } = payload

  const lockFiles: string[] = []
  await github.paginate(
    github.pullRequests.listFiles(context.issue({ per_page: 100 })),
      (res) => {
        const typedResData: Octokit.PullRequestsListFilesResponse = res.data
        for (const file of typedResData) {
          const parts = file.filename.split('/')

          switch (parts[parts.length - 1]) {
            case 'package-lock.json':
            case 'yarn.lock':
            case 'Gopkg.lock':
              lockFiles.push(file.filename)
              break
          }
        }
      },
  )

  if (lockFiles.length !== 0) {
    const configFilename = 'package-lock-snitch.config.json'
    const config: Config = await context.config(configFilename, { recipients: [] } as Config)
    const filesChanged = Humanize.oxford(lockFiles.map((f) => `\`${f}\``), 5)
    if (config.recipients.length !== 0) {
      const pingTargets = Humanize.oxford(config.recipients.map((u) => `@${u}`))
      const issueComment = context.issue({ body: `${filesChanged} changed. Pinging ${pingTargets}` })

      context.log.info(`Creating comment on ${pull_request.html_url} pinging ${pingTargets}`)
      await context.github.issues.createComment(issueComment)
    } else {
      context.log.debug(
        `No recipients configured in ${payload.repository.html_url}/.github/${configFilename}, ignoring`)
    }
  } else {
    context.log.debug(`No lock files changed in ${pull_request.html_url}`)
  }
}
