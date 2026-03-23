- Your task is to create a product like google drive but for the 2026 world of AI Agents
- it is google drive but for agents like openclaw (research this if you don't know what these mean)


Branding
- The name of the project is ClawDrive
- The cli tool can be cdrive

Landing Page
- the landing page should have a vibe like: https://actors.dev/


Preface
- some people have an always-on mac mini running that has either claude code or openclaw running

File Sharing
- sharing of files is very important
- it should be possible to share a file from the local storage
- it should have a cli tool so that agents like openclaw can share files
- managing permission is very important

Personal Opinions/Pain Points
- I don't like having to sort my files into folders, the agent should take care of sorting things into folders
- i don't want to see/naviage folders really, it should serve me the right file at the right time
- if i am collaborating on a project with someone i need to share the google docs/sheets etc links and put their email in there and also in some cases share those links again as the person receiving them can not keep track of all these links in their chat history
- if i am collaborating with someone and they don't have access to a file, they need to send me a message to ask for access to that file, they don't even know what files i have in the first place
- if i am collaborating with someone on a codebase, i keep a context/ folder in my codebase which is gitignored, but it may have useful docs etc which i don't want
- another pain point is that if there is an openclaw agent/ claude code agent running on an always on mac mini

Other notes
- its very improtant to think hard about the kind of google drive for the 2026 world of AI Agents
- it has to be a futuristic idea for when agents hanlde a lot more tasks autonomously for us
- perhaps in future, everyone will have their personal assistant agent

Goal
- The goal is to create the full thing end-to-end + landing page, so that we can post it on X
- We need to optimize for a great demo and virality

UI
- one idea is a 3d plot of the embeddings like https://tom-doerr.github.io/repo_posts/map.html (see the 3d map of the embeddings and how it shows snippets on top of the points), the idea is to get rid of folders. This would be more so for marketing
- perhaps we can cluster the embeddings which would act as kind of folders
- second idea is to organize things into hierarchies/taxonomoy, one main topic/sub-topic having no more than 8-10 things inside of it. this is analogous to having folders and subfolders. this seems more sensible.


The ui/ file browser will be plain simple:
- keybpoard shortcut to open a kind of spotlight search, where the user enters what they want, which triggers an agentic search across the files



Tech
- use gemini embedding 2 preview (the lastest one that just came out in March 2026), see all the modalities that it supports. This is one of the SOTA models that unifies all the modalities into a shared embedding space.
- we should call the idea of a space/cell/container/box a 'pot' so a pot can be share in the cli it would 'share pot' or something like that, and it can be called a shared pot in general
- 


Operational
- gemini api key in .env


Relevant Repos
- the following repos might be of interest to see how they do things, they are opensource so you can have a look at the code, you may clone these repos in context/ to explore them fully using a subagent. do not use the repos directly as an installed package, instead try to learn from their architecture of certain features and re-implement them in our codebase
- https://github.com/volcengine/OpenViking (basically does multimodal search, it has different levels L0, L1, L2 system which is great, it follows the correct pattern of embeddings + agentic search)
- https://sftpgo.com/ (sharing mechanism, combining all cloud storage into one front door)
- https://www.pydio.com/ (cool cells concept)
- https://nextcloud.com/files/ (google drive like layout and feature rich)

Here are some other projects that describe something similar:
- https://chatbotkit.com/docs/spaces
- https://pidrive.ressl.ai/

Others:
- https://www.puppyone.ai/en
- https://spacedrive.com/
- https://moxt.ai/en-US