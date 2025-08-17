"use client"

import type React from "react"

import { useState, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Upload,
  Download,
  Settings,
  Moon,
  Sun,
  ImageIcon,
  Zap,
  Package,
  Code,
  Terminal,
  Activity,
  Minimize2,
  FileText,
  Globe,
  Shield,
  Eye,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"
import JSZip from "jszip"

// Import all mini-tools
import { CodeEditor } from "@/components/mini-tools/code-editor"
import { DebugConsole } from "@/components/mini-tools/debug-console"
import { PerformanceAnalyzer } from "@/components/mini-tools/performance-analyzer"
import { CodeMinifier } from "@/components/mini-tools/code-minifier"
import { ManifestGenerator } from "@/components/mini-tools/manifest-generator"
import { ApiTester } from "@/components/mini-tools/api-tester"
import { ExtensionPackager } from "@/components/mini-tools/extension-packager"
import { LivePreview } from "@/components/mini-tools/live-preview"
import { StoreValidator } from "@/components/mini-tools/store-validator"

interface ProcessedIcon {
  id: string
  originalName: string
  size: number
  blob: Blob
  url: string
  filename: string
  fileSize: number
  originalFileSize?: number
  compressionRatio?: number
}

export default function IconResizerDashboard() {
  const [isDark, setIsDark] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [sizes, setSizes] = useState("16,32,48,128")
  const [processedIcons, setProcessedIcons] = useState<ProcessedIcon[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()
  const [outputFormat, setOutputFormat] = useState<"png" | "jpeg" | "webp">("png")
  const [compressionQuality, setCompressionQuality] = useState(0.9)

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragActive(false)

      const droppedFiles = Array.from(e.dataTransfer.files).filter(
        (file) => file.type === "image/svg+xml" || file.type === "image/png",
      )

      if (droppedFiles.length > 0) {
        setFiles((prev) => [...prev, ...droppedFiles])
        toast({
          title: "Files added!",
          description: `${droppedFiles.length} file(s) ready for processing`,
        })
      }
    },
    [toast],
  )

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files).filter(
        (file) => file.type === "image/svg+xml" || file.type === "image/png",
      )
      setFiles((prev) => [...prev, ...selectedFiles])
      toast({
        title: "Files selected!",
        description: `${selectedFiles.length} file(s) ready for processing`,
      })
    }
  }

  const processImages = async () => {
    if (files.length === 0) {
      toast({
        title: "No files selected",
        description: "Please select some SVG or PNG files first",
        variant: "destructive",
      })
      return
    }

    const sizeArray = sizes
      .split(",")
      .map((s) => Number.parseInt(s.trim()))
      .filter((s) => s > 0)
    if (sizeArray.length === 0) {
      toast({
        title: "Invalid sizes",
        description: "Please enter valid comma-separated sizes",
        variant: "destructive",
      })
      return
    }

    setIsProcessing(true)
    setProgress(0)
    const newProcessedIcons: ProcessedIcon[] = []
    const totalOperations = files.length * sizeArray.length
    let completedOperations = 0

    try {
      for (const file of files) {
        const img = new Image()
        img.crossOrigin = "anonymous"
        const imageUrl = URL.createObjectURL(file)

        await new Promise((resolve, reject) => {
          img.onload = resolve
          img.onerror = reject
          img.src = imageUrl
        })

        for (const size of sizeArray) {
          const canvas = document.createElement("canvas")
          const ctx = canvas.getContext("2d")!
          canvas.width = size
          canvas.height = size

          // Calculate scaling to maintain aspect ratio
          const scale = Math.min(size / img.width, size / img.height)
          const scaledWidth = img.width * scale
          const scaledHeight = img.height * scale
          const x = (size - scaledWidth) / 2
          const y = (size - scaledHeight) / 2

          // Set background for JPEG format
          if (outputFormat === "jpeg") {
            ctx.fillStyle = "#FFFFFF"
            ctx.fillRect(0, 0, size, size)
          } else {
            ctx.fillStyle = "transparent"
            ctx.fillRect(0, 0, size, size)
          }

          ctx.drawImage(img, x, y, scaledWidth, scaledHeight)

          // Create uncompressed version for comparison
          const uncompressedBlob = await new Promise<Blob>((resolve) => {
            canvas.toBlob((blob) => resolve(blob!), "image/png", 1.0)
          })

          // Create compressed version
          const mimeType = `image/${outputFormat}`
          const quality = outputFormat === "png" ? undefined : compressionQuality

          const blob = await new Promise<Blob>((resolve) => {
            canvas.toBlob((blob) => resolve(blob!), mimeType, quality)
          })

          const processedUrl = URL.createObjectURL(blob)
          const baseName = file.name.replace(/\.[^/.]+$/, "")
          const extension = outputFormat === "jpeg" ? "jpg" : outputFormat
          const filename = `${baseName}_${size}x${size}.${extension}`

          const compressionRatio = ((uncompressedBlob.size - blob.size) / uncompressedBlob.size) * 100

          newProcessedIcons.push({
            id: `${file.name}-${size}`,
            originalName: file.name,
            size,
            blob,
            url: processedUrl,
            filename,
            fileSize: blob.size,
            originalFileSize: uncompressedBlob.size,
            compressionRatio: Math.max(0, compressionRatio),
          })

          completedOperations++
          setProgress((completedOperations / totalOperations) * 100)
        }

        URL.revokeObjectURL(imageUrl)
      }

      setProcessedIcons(newProcessedIcons)

      toast({
        title: "Processing complete!",
        description: `Generated ${newProcessedIcons.length} icons`,
      })
    } catch (error) {
      toast({
        title: "Processing failed",
        description: "An error occurred while processing images",
        variant: "destructive",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const downloadIcon = (icon: ProcessedIcon) => {
    const link = document.createElement("a")
    link.href = icon.url
    link.download = icon.filename
    link.click()
  }

  const downloadAllAsZip = async () => {
    if (processedIcons.length === 0) return

    const zip = new JSZip()

    for (const icon of processedIcons) {
      zip.file(icon.filename, icon.blob)
    }

    const zipBlob = await zip.generateAsync({ type: "blob" })
    const zipUrl = URL.createObjectURL(zipBlob)

    const link = document.createElement("a")
    link.href = zipUrl
    link.download = "chrome-extension-icons.zip"
    link.click()

    URL.revokeObjectURL(zipUrl)
    toast({
      title: "ZIP downloaded!",
      description: `Downloaded ${processedIcons.length} icons as ZIP`,
    })
  }

  const clearAll = () => {
    processedIcons.forEach((icon) => URL.revokeObjectURL(icon.url))
    setProcessedIcons([])
    setFiles([])
    setProgress(0)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B"
    const k = 1024
    const sizes = ["B", "KB", "MB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDark ? "dark bg-retro-green" : "bg-retro-cream"}`}>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center space-x-3">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
              className="w-10 h-10 bg-retro-tan rounded-lg flex items-center justify-center"
            >
              <Package className="w-6 h-6 text-retro-green" />
            </motion.div>
            <div>
              <h1 className="text-2xl font-bold font-mono text-retro-green">Chrome Extension Developer Suite</h1>
              <p className="text-sm text-retro-green/70 font-mono">Complete toolkit for Chrome extension development</p>
            </div>
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsDark(!isDark)}
            className="border-retro-green text-retro-green hover:bg-retro-tan"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </motion.div>

        {/* Main Tabs - Organized into logical chunks */}
        <Tabs defaultValue="assets" className="w-full">
          <TabsList className="grid w-full grid-cols-5 bg-retro-beige/50">
            <TabsTrigger value="assets" className="font-mono text-xs">
              <ImageIcon className="w-4 h-4 mr-1" />
              Assets
            </TabsTrigger>
            <TabsTrigger value="development" className="font-mono text-xs">
              <Code className="w-4 h-4 mr-1" />
              Development
            </TabsTrigger>
            <TabsTrigger value="testing" className="font-mono text-xs">
              <Terminal className="w-4 h-4 mr-1" />
              Testing
            </TabsTrigger>
            <TabsTrigger value="optimization" className="font-mono text-xs">
              <Zap className="w-4 h-4 mr-1" />
              Optimization
            </TabsTrigger>
            <TabsTrigger value="deployment" className="font-mono text-xs">
              <Package className="w-4 h-4 mr-1" />
              Deployment
            </TabsTrigger>
          </TabsList>

          {/* Assets Tab - Icon Resizer */}
          <TabsContent value="assets" className="space-y-6">
            <Tabs defaultValue="icon-resizer" className="w-full">
              <TabsList className="grid w-full grid-cols-1 bg-retro-beige/30">
                <TabsTrigger value="icon-resizer" className="font-mono">
                  <ImageIcon className="w-4 h-4 mr-2" />
                  Icon Resizer & Generator
                </TabsTrigger>
              </TabsList>

              <TabsContent value="icon-resizer" className="space-y-6">
                {/* Upload Section */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 }}
                >
                  <Card className="border-retro-green/20 bg-retro-cream/50">
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2 text-retro-green font-mono">
                        <Upload className="w-5 h-5" />
                        <span>Input Acquisition</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div
                        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                          dragActive
                            ? "border-retro-tan bg-retro-tan/10"
                            : "border-retro-green/30 hover:border-retro-tan"
                        }`}
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                      >
                        <motion.div animate={dragActive ? { scale: 1.05 } : { scale: 1 }} className="space-y-3">
                          <ImageIcon className="w-12 h-12 mx-auto text-retro-green/50" />
                          <div>
                            <p className="text-retro-green font-mono">Drag & drop SVG/PNG files here</p>
                            <p className="text-sm text-retro-green/60 font-mono">or click to browse</p>
                          </div>
                          <Button
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                            className="border-retro-green text-retro-green hover:bg-retro-tan font-mono"
                          >
                            Browse Files
                          </Button>
                        </motion.div>
                      </div>

                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".svg,.png"
                        onChange={handleFileSelect}
                        className="hidden"
                      />

                      {files.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="space-y-2"
                        >
                          <p className="text-sm font-mono text-retro-green">Selected files ({files.length}):</p>
                          <div className="flex flex-wrap gap-2">
                            {files.map((file, index) => (
                              <Badge key={index} variant="secondary" className="font-mono">
                                {file.name}
                              </Badge>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>

                {/* Size Configuration */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  <Card className="border-retro-green/20 bg-retro-cream/50">
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2 text-retro-green font-mono">
                        <Settings className="w-5 h-5" />
                        <span>Size Configuration</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex space-x-4">
                        <div className="flex-1">
                          <Input
                            value={sizes}
                            onChange={(e) => setSizes(e.target.value)}
                            placeholder="16,32,48,128"
                            className="font-mono border-retro-green/30 focus:border-retro-tan"
                          />
                          <p className="text-xs text-retro-green/60 mt-1 font-mono">
                            Comma-separated dimensions (e.g., 16,32,48,128)
                          </p>
                        </div>
                        <Button
                          onClick={processImages}
                          disabled={isProcessing || files.length === 0}
                          className="bg-retro-tan hover:bg-retro-tan/80 text-retro-green font-mono"
                        >
                          <Zap className="w-4 h-4 mr-2" />
                          {isProcessing ? "Processing..." : "Generate Icons"}
                        </Button>
                      </div>

                      {isProcessing && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
                          <Progress value={progress} className="h-2" />
                          <p className="text-sm text-retro-green font-mono">Processing... {Math.round(progress)}%</p>
                        </motion.div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>

                {/* Results */}
                <AnimatePresence>
                  {processedIcons.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                    >
                      <Card className="border-retro-green/20 bg-retro-cream/50">
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center space-x-2 text-retro-green font-mono">
                              <Download className="w-5 h-5" />
                              <span>Generated Icons ({processedIcons.length})</span>
                            </CardTitle>
                            <div className="space-x-2">
                              <Button
                                onClick={downloadAllAsZip}
                                className="bg-retro-green hover:bg-retro-green/80 text-retro-cream font-mono"
                              >
                                Download All (ZIP)
                              </Button>
                              <Button
                                onClick={clearAll}
                                variant="outline"
                                className="border-retro-green text-retro-green hover:bg-retro-tan font-mono bg-transparent"
                              >
                                Clear All
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                            {processedIcons.map((icon, index) => (
                              <motion.div
                                key={icon.id}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: index * 0.05 }}
                                className="group"
                              >
                                <Card className="border-retro-green/20 hover:border-retro-tan transition-colors">
                                  <CardContent className="p-3 space-y-2">
                                    <div className="aspect-square bg-retro-beige rounded-lg p-2 flex items-center justify-center">
                                      <img
                                        src={icon.url || "/placeholder.svg"}
                                        alt={icon.filename}
                                        className="max-w-full max-h-full object-contain"
                                      />
                                    </div>
                                    <div className="text-center space-y-1">
                                      <p className="text-xs font-mono text-retro-green truncate">{icon.filename}</p>
                                      <div className="flex justify-center space-x-1">
                                        <Badge variant="outline" className="text-xs font-mono">
                                          {icon.size}×{icon.size}
                                        </Badge>
                                        <Badge variant="secondary" className="text-xs font-mono">
                                          {formatFileSize(icon.fileSize)}
                                        </Badge>
                                      </div>
                                      {icon.compressionRatio && icon.compressionRatio > 0 && (
                                        <div className="text-xs font-mono text-retro-tan">
                                          -{icon.compressionRatio.toFixed(1)}% size
                                        </div>
                                      )}
                                    </div>
                                    <Button
                                      size="sm"
                                      onClick={() => downloadIcon(icon)}
                                      className="w-full bg-retro-tan hover:bg-retro-tan/80 text-retro-green font-mono text-xs"
                                    >
                                      Download
                                    </Button>
                                  </CardContent>
                                </Card>
                              </motion.div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )}
                </AnimatePresence>
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* Development Tab */}
          <TabsContent value="development" className="space-y-6">
            <Tabs defaultValue="code-editor" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-retro-beige/30">
                <TabsTrigger value="code-editor" className="font-mono">
                  <Code className="w-4 h-4 mr-2" />
                  Code Editor
                </TabsTrigger>
                <TabsTrigger value="manifest-generator" className="font-mono">
                  <FileText className="w-4 h-4 mr-2" />
                  Manifest Generator
                </TabsTrigger>
              </TabsList>

              <TabsContent value="code-editor">
                <CodeEditor />
              </TabsContent>

              <TabsContent value="manifest-generator">
                <ManifestGenerator />
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* Testing Tab */}
          <TabsContent value="testing" className="space-y-6">
            <Tabs defaultValue="debug-console" className="w-full">
              <TabsList className="grid w-full grid-cols-3 bg-retro-beige/30">
                <TabsTrigger value="debug-console" className="font-mono">
                  <Terminal className="w-4 h-4 mr-2" />
                  Debug Console
                </TabsTrigger>
                <TabsTrigger value="api-tester" className="font-mono">
                  <Globe className="w-4 h-4 mr-2" />
                  API Tester
                </TabsTrigger>
                <TabsTrigger value="live-preview" className="font-mono">
                  <Eye className="w-4 h-4 mr-2" />
                  Live Preview
                </TabsTrigger>
              </TabsList>

              <TabsContent value="debug-console">
                <DebugConsole />
              </TabsContent>

              <TabsContent value="api-tester">
                <ApiTester />
              </TabsContent>

              <TabsContent value="live-preview">
                <LivePreview />
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* Optimization Tab */}
          <TabsContent value="optimization" className="space-y-6">
            <Tabs defaultValue="performance-analyzer" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-retro-beige/30">
                <TabsTrigger value="performance-analyzer" className="font-mono">
                  <Activity className="w-4 h-4 mr-2" />
                  Performance Analyzer
                </TabsTrigger>
                <TabsTrigger value="code-minifier" className="font-mono">
                  <Minimize2 className="w-4 h-4 mr-2" />
                  Code Minifier
                </TabsTrigger>
              </TabsList>

              <TabsContent value="performance-analyzer">
                <PerformanceAnalyzer />
              </TabsContent>

              <TabsContent value="code-minifier">
                <CodeMinifier />
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* Deployment Tab */}
          <TabsContent value="deployment" className="space-y-6">
            <Tabs defaultValue="extension-packager" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-retro-beige/30">
                <TabsTrigger value="extension-packager" className="font-mono">
                  <Package className="w-4 h-4 mr-2" />
                  Extension Packager
                </TabsTrigger>
                <TabsTrigger value="store-validator" className="font-mono">
                  <Shield className="w-4 h-4 mr-2" />
                  Store Validator
                </TabsTrigger>
              </TabsList>

              <TabsContent value="extension-packager">
                <ExtensionPackager />
              </TabsContent>

              <TabsContent value="store-validator">
                <StoreValidator />
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </div>
      <Toaster />
    </div>
  )
}
