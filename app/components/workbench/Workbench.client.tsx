import { useStore } from '@nanostores/react';
import { motion, type HTMLMotionProps, type Variants } from 'framer-motion';
import { computed } from 'nanostores';
import { memo, useCallback, useEffect } from 'react';
import { toast } from 'react-toastify';
import {
  type OnChangeCallback as OnEditorChange,
  type OnScrollCallback as OnEditorScroll,
} from '~/components/editor/codemirror/CodeMirrorEditor';
import { IconButton } from '~/components/ui/IconButton';
import { PanelHeaderButton } from '~/components/ui/PanelHeaderButton';
import { Slider, type SliderOptions } from '~/components/ui/Slider';
import { workbenchStore, type WorkbenchViewType } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';
import { renderLogger } from '~/utils/logger';
import { EditorPanel } from './EditorPanel';
import { Preview } from './Preview';
import { webcontainer } from '~/lib/webcontainer';

interface WorkspaceProps {
  chatStarted?: boolean;
  isStreaming?: boolean;
}

const viewTransition = { ease: cubicEasingFn };

const sliderOptions: SliderOptions<WorkbenchViewType> = {
  left: {
    value: 'code',
    text: 'Code',
  },
  right: {
    value: 'preview',
    text: 'Preview',
  },
};

const workbenchVariants = {
  closed: {
    width: 0,
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
  open: {
    width: 'var(--workbench-width)',
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
} satisfies Variants;

export const Workbench = memo(({ chatStarted, isStreaming }: WorkspaceProps) => {
  renderLogger.trace('Workbench');

  const hasPreview = useStore(computed(workbenchStore.previews, (previews) => previews.length > 0));
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const selectedFile = useStore(workbenchStore.selectedFile);
  const currentDocument = useStore(workbenchStore.currentDocument);
  const unsavedFiles = useStore(workbenchStore.unsavedFiles);
  const files = useStore(workbenchStore.files);
  const selectedView = useStore(workbenchStore.currentView);

  const setSelectedView = (view: WorkbenchViewType) => {
    workbenchStore.currentView.set(view);
  };

  useEffect(() => {
    if (hasPreview) {
      setSelectedView('preview');
    }
  }, [hasPreview]);

  useEffect(() => {
    console.log('workbenchStore:', workbenchStore);
    workbenchStore.setDocuments(files);
  }, [files]);

  const onEditorChange = useCallback<OnEditorChange>((update) => {
    workbenchStore.setCurrentDocumentContent(update.content);
  }, []);

  const onEditorScroll = useCallback<OnEditorScroll>((position) => {
    workbenchStore.setCurrentDocumentScrollPosition(position);
  }, []);

  const onFileSelect = useCallback((filePath: string | undefined) => {
    workbenchStore.setSelectedFile(filePath);
  }, []);

  const onFileSave = useCallback(() => {
    workbenchStore.saveCurrentDocument().catch(() => {
      toast.error('Failed to update file content');
    });
  }, []);

  const onFileReset = useCallback(() => {
    workbenchStore.resetCurrentDocument();
  }, []);

  // 递归读取目录内容
  const readDirectory = async (webContainer, path) => {
    const entries = await webContainer.fs.readdir(path, { withFileTypes: true });
    const result = [];

    for (const entry of entries) {
      const fullPath = `${path}/${entry.name}`;

      if (entry.isDirectory()) {
        // 如果是目录，递归读取
        const subDir = await readDirectory(webContainer, fullPath);
        result.push({
          name: entry.name,
          path: fullPath,
          type: 'directory',
          children: subDir,
        });
      } else {
        // 如果是文件，读取内容
        const content = await webContainer.fs.readFile(fullPath, 'utf-8');
        result.push({
          name: entry.name,
          path: fullPath,
          type: 'file',
          content,
        });
      }
    }

    return result;
  };

  // 打包单个文件并下载
  const downloadSingleFile = async (webContainer, filePath) => {
    try {
      // 读取文件内容
      const content = await webContainer.fs.readFile(filePath);

      // 创建Blob对象
      const blob = new Blob([content], { type: 'application/octet-stream' });

      // 创建下载链接
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // 从路径中提取文件名
      const fileName = filePath.split('/').pop();
      a.download = fileName;

      // 触发下载
      document.body.appendChild(a);
      a.click();

      // 清理
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);

      console.log(`文件 ${filePath} 下载成功`);
    } catch (error) {
      console.error(`下载文件失败: ${error.message}`);
    }
  };

  // 打包目录为ZIP并下载（需要引入jszip库）
  const downloadDirectoryAsZip = async (webContainer, dirPath) => {
    try {
      // 确保已安装jszip
      if (typeof JSZip === 'undefined') {
        throw new Error('请先引入JSZip库 (https://stuk.github.io/jszip/)');
      }

      const zip = new JSZip();
      const dirContent = await readDirectory(webContainer, dirPath);

      // 递归添加目录内容到ZIP
      function addToZip(entries, parentPath = '') {
        entries.forEach((entry) => {
          const entryPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;

          if (entry.type === 'directory') {
            zip.folder(entryPath);
            addToZip(entry.children, entryPath);
          } else {
            zip.file(entryPath, entry.content);
          }
        });
      }

      addToZip(dirContent);

      // 生成ZIP文件并下载
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;

      // 从路径中提取目录名作为ZIP文件名
      const dirName = dirPath.split('/').pop() || 'webcontainer-files';
      a.download = `${dirName}.zip`;

      // 触发下载
      document.body.appendChild(a);
      a.click();

      // 清理
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);

      console.log(`目录 ${dirPath} 已打包为ZIP并下载`);
    } catch (error) {
      console.error(`打包目录失败: ${error.message}`);
    }
  };

  return (
    chatStarted && (
      <motion.div
        initial="closed"
        animate={showWorkbench ? 'open' : 'closed'}
        variants={workbenchVariants}
        className="z-workbench"
      >
        <div
          className={classNames(
            'fixed top-[calc(var(--header-height)+1.5rem)] bottom-6 w-[var(--workbench-inner-width)] mr-4 z-0 transition-[left,width] duration-200 bolt-ease-cubic-bezier',
            {
              'left-[var(--workbench-left)]': showWorkbench,
              'left-[100%]': !showWorkbench,
            },
          )}
        >
          <div className="absolute inset-0 px-6">
            <div className="h-full flex flex-col bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor shadow-sm rounded-lg overflow-hidden">
              <div className="flex items-center px-3 py-2 border-b border-bolt-elements-borderColor">
                <Slider selected={selectedView} options={sliderOptions} setSelected={setSelectedView} />
                <div className="ml-auto" />
                {selectedView === 'code' && (
                  <PanelHeaderButton
                    className="mr-1 text-sm"
                    onClick={() => {
                      workbenchStore.toggleTerminal(!workbenchStore.showTerminal.get());
                    }}
                  >
                    <div className="i-ph:terminal" />
                    Toggle Terminal
                  </PanelHeaderButton>
                )}
                <IconButton
                  icon="i-ph:download"
                  className="-mr-1"
                  size="xl"
                  onClick={async () => {
                    console.log('webcontainer', webcontainer);

                    const webContainer = await webcontainer;

                    /*
                     * debugger;
                     * await downloadSingleFile(webContainer, '/index.html');
                     */
                    await downloadDirectoryAsZip(webContainer, '/');
                  }}
                />
                <IconButton
                  icon="i-ph:x-circle"
                  className="-mr-1"
                  size="xl"
                  onClick={async () => {
                    workbenchStore.showWorkbench.set(false);
                  }}
                />
              </div>
              <div className="relative flex-1 overflow-hidden">
                <View
                  initial={{ x: selectedView === 'code' ? 0 : '-100%' }}
                  animate={{ x: selectedView === 'code' ? 0 : '-100%' }}
                >
                  <EditorPanel
                    editorDocument={currentDocument}
                    isStreaming={isStreaming}
                    selectedFile={selectedFile}
                    files={files}
                    unsavedFiles={unsavedFiles}
                    onFileSelect={onFileSelect}
                    onEditorScroll={onEditorScroll}
                    onEditorChange={onEditorChange}
                    onFileSave={onFileSave}
                    onFileReset={onFileReset}
                  />
                </View>
                <View
                  initial={{ x: selectedView === 'preview' ? 0 : '100%' }}
                  animate={{ x: selectedView === 'preview' ? 0 : '100%' }}
                >
                  <Preview />
                </View>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    )
  );
});

interface ViewProps extends HTMLMotionProps<'div'> {
  children: JSX.Element;
}

const View = memo(({ children, ...props }: ViewProps) => {
  return (
    <motion.div className="absolute inset-0" transition={viewTransition} {...props}>
      {children}
    </motion.div>
  );
});
