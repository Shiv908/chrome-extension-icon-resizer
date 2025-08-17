"use client"

import type React from "react"

import { useState, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Shield, CheckCircle, XCircle, AlertTriangle, Upload, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useToast } from "@/hooks/use-toast"

interface StoreValidationResult {
  category: "manifest" | "icons" | "privacy" | "content" | "permissions" | "metadata"
  type: "error" | "warning" | "info" | "success"
  title: string
  message: string
  requirement: string
  suggestion?: string
  severity: "critical" | "high" | "medium" | "low"
}

interface ExtensionMetadata {
  name: string
  description: string
  version: string
  icons: { [size: string]: string }
  permissions: string[]
  manifest_version: number
  screenshots?: string[]
  promotional_images?: string[]
}

const STORE_REQUIREMENTS = {
  manifest: {
    required_fields: ["name", "version", "description", "manifest_version"],
    name_length: { min: 3, max: 45 },
    description_length: { min: 10, max: 132 },
    version_format: /^\d+(\.\d+)*$/,
  },
  icons: {
    required_sizes: [16, 48, 128],
    recommended_sizes: [19, 38, 32, 64, 96],
    max_file_size: 2 * 1024 * 1024, // 2MB
    formats: ["png", "jpg", "jpeg"],
  },
  permissions: {
    dangerous: ["<all_urls>", "http://*/*", "https://*/*", "tabs", "history", "bookmarks"],
    requires_justification: ["activeTab", "storage", "notifications"],
  },
  content: {
    max_package_size: 128 * 1024 * 1024, // 128MB
    prohibited_content: ["cryptocurrency", "mining", "adult", "violence"],
  },
  privacy: {
    required_if_data_collection: ["privacy_policy"],
    data_collection_apis: ["identity", "cookies", "history", "tabs"],
  },
}

export function StoreValidator() {
  const [validationResults, setValidationResults] = useState<StoreValidationResult[]>([])
  const [isValidating, setIsValidating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [extensionData, setExtensionData] = useState<ExtensionMetadata | null>(null)
  const [overallScore, setOverallScore] = useState(0)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

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
    async (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragActive(false)

      const files = Array.from(e.dataTransfer.files)
      const manifestFile = files.find((f) => f.name === "manifest.json")

      if (manifestFile) {
        const content = await manifestFile.text()
        try {
          const manifest = JSON.parse(content)
          setExtensionData(manifest)
          await validateForStore(manifest, files)
        } catch (error) {
          toast({
            title: "Invalid manifest",
            description: "Could not parse manifest.json",
            variant: "destructive",
          })
        }
      } else {
        toast({
          title: "Manifest not found",
          description: "Please include manifest.json in your upload",
          variant: "destructive",
        })
      }
    },
    [toast],
  )

  const validateForStore = async (manifest: any, files: File[]) => {
    setIsValidating(true)
    setProgress(0)
    const results: StoreValidationResult[] = []

    try {
      // Validate manifest requirements
      await validateManifestRequirements(manifest, results)
      setProgress(20)

      // Validate icons
      await validateIconRequirements(manifest, files, results)
      setProgress(40)

      // Validate permissions
      await validatePermissionRequirements(manifest, results)
      setProgress(60)

      // Validate privacy requirements
      await validatePrivacyRequirements(manifest, results)
      setProgress(80)

      // Validate content policies
      await validateContentPolicies(manifest, files, results)
      setProgress(100)

      setValidationResults(results)
      calculateOverallScore(results)

      const criticalIssues = results.filter((r) => r.severity === "critical").length
      const errors = results.filter((r) => r.type === "error").length

      toast({
        title: "Store validation complete",
        description: `Found ${criticalIssues} critical issues and ${errors} errors`,
        variant: criticalIssues > 0 ? "destructive" : "default",
      })
    } catch (error) {
      toast({
        title: "Validation failed",
        description: "An error occurred during store validation",
        variant: "destructive",
      })
    } finally {
      setIsValidating(false)
    }
  }

  const validateManifestRequirements = async (manifest: any, results: StoreValidationResult[]) => {
    // Required fields
    for (const field of STORE_REQUIREMENTS.manifest.required_fields) {
      if (!manifest[field]) {
        results.push({
          category: "manifest",
          type: "error",
          severity: "critical",
          title: `Missing ${field}`,
          message: `The ${field} field is required for Chrome Web Store`,
          requirement: "Chrome Web Store requires all extensions to have basic metadata",
          suggestion: `Add "${field}" field to your manifest.json`,
        })
      }
    }

    // Name length validation
    if (manifest.name) {
      const nameLength = manifest.name.length
      if (nameLength < STORE_REQUIREMENTS.manifest.name_length.min) {
        results.push({
          category: "manifest",
          type: "error",
          severity: "high",
          title: "Name too short",
          message: `Extension name must be at least ${STORE_REQUIREMENTS.manifest.name_length.min} characters`,
          requirement: "Chrome Web Store naming requirements",
          suggestion: "Choose a more descriptive name for your extension",
        })
      } else if (nameLength > STORE_REQUIREMENTS.manifest.name_length.max) {
        results.push({
          category: "manifest",
          type: "error",
          severity: "high",
          title: "Name too long",
          message: `Extension name must be no more than ${STORE_REQUIREMENTS.manifest.name_length.max} characters`,
          requirement: "Chrome Web Store naming requirements",
          suggestion: "Shorten your extension name",
        })
      }
    }

    // Description length validation
    if (manifest.description) {
      const descLength = manifest.description.length
      if (descLength < STORE_REQUIREMENTS.manifest.description_length.min) {
        results.push({
          category: "manifest",
          type: "error",
          severity: "high",
          title: "Description too short",
          message: `Description must be at least ${STORE_REQUIREMENTS.manifest.description_length.min} characters`,
          requirement: "Chrome Web Store requires meaningful descriptions",
          suggestion: "Provide a more detailed description of your extension's functionality",
        })
      } else if (descLength > STORE_REQUIREMENTS.manifest.description_length.max) {
        results.push({
          category: "manifest",
          type: "warning",
          severity: "medium",
          title: "Description too long",
          message: `Description should be no more than ${STORE_REQUIREMENTS.manifest.description_length.max} characters`,
          requirement: "Chrome Web Store description guidelines",
          suggestion: "Shorten your description to be more concise",
        })
      }
    }

    // Version format validation
    if (manifest.version && !STORE_REQUIREMENTS.manifest.version_format.test(manifest.version)) {
      results.push({
        category: "manifest",
        type: "error",
        severity: "high",
        title: "Invalid version format",
        message: "Version must follow semantic versioning (e.g., 1.0.0)",
        requirement: "Chrome Web Store version requirements",
        suggestion: "Use format like 1.0.0 or 2.1.3",
      })
    }

    // Manifest version check
    if (manifest.manifest_version === 2) {
      results.push({
        category: "manifest",
        type: "warning",
        severity: "high",
        title: "Manifest V2 deprecation",
        message: "Manifest V2 extensions will stop working in 2024",
        requirement: "Chrome Web Store is transitioning to Manifest V3",
        suggestion: "Migrate to Manifest V3 for future compatibility",
      })
    }
  }

  const validateIconRequirements = async (manifest: any, files: File[], results: StoreValidationResult[]) => {
    if (!manifest.icons) {
      results.push({
        category: "icons",
        type: "error",
        severity: "critical",
        title: "No icons specified",
        message: "Chrome Web Store requires extension icons",
        requirement: "Icons are mandatory for store listing",
        suggestion: "Add icons field to manifest with at least 16px, 48px, and 128px sizes",
      })
      return
    }

    // Check required icon sizes
    for (const size of STORE_REQUIREMENTS.icons.required_sizes) {
      if (!manifest.icons[size.toString()]) {
        results.push({
          category: "icons",
          type: "error",
          severity: "high",
          title: `Missing ${size}px icon`,
          message: `${size}px icon is required for Chrome Web Store`,
          requirement: "Chrome Web Store icon requirements",
          suggestion: `Add a ${size}x${size} pixel icon to your extension`,
        })
      }
    }

    // Check recommended icon sizes
    for (const size of STORE_REQUIREMENTS.icons.recommended_sizes) {
      if (!manifest.icons[size.toString()]) {
        results.push({
          category: "icons",
          type: "info",
          severity: "low",
          title: `Recommended ${size}px icon missing`,
          message: `${size}px icon is recommended for better display`,
          requirement: "Chrome Web Store icon best practices",
          suggestion: `Consider adding a ${size}x${size} pixel icon`,
        })
      }
    }

    // Validate icon files exist
    for (const [size, iconPath] of Object.entries(manifest.icons)) {
      const iconFile = files.find((f) => f.name === iconPath || f.name.endsWith(iconPath as string))
      if (!iconFile) {
        results.push({
          category: "icons",
          type: "error",
          severity: "high",
          title: `Icon file not found`,
          message: `Icon file ${iconPath} referenced in manifest but not found`,
          requirement: "All referenced files must be included",
          suggestion: `Include the ${iconPath} file in your extension package`,
        })
      } else {
        // Check file size
        if (iconFile.size > STORE_REQUIREMENTS.icons.max_file_size) {
          results.push({
            category: "icons",
            type: "warning",
            severity: "medium",
            title: `Large icon file`,
            message: `Icon ${iconPath} is ${(iconFile.size / 1024 / 1024).toFixed(1)}MB`,
            requirement: "Keep icon files small for faster loading",
            suggestion: "Optimize icon files to reduce size",
          })
        }
      }
    }
  }

  const validatePermissionRequirements = async (manifest: any, results: StoreValidationResult[]) => {
    if (!manifest.permissions) return

    // Check for dangerous permissions
    for (const permission of manifest.permissions) {
      if (STORE_REQUIREMENTS.permissions.dangerous.includes(permission)) {
        results.push({
          category: "permissions",
          type: "warning",
          severity: "high",
          title: `Broad permission: ${permission}`,
          message: "This permission may require additional review",
          requirement: "Chrome Web Store reviews extensions with broad permissions carefully",
          suggestion: "Consider using more specific permissions if possible",
        })
      }
    }

    // Check for excessive permissions
    if (manifest.permissions.length > 10) {
      results.push({
        category: "permissions",
        type: "warning",
        severity: "medium",
        title: "Many permissions requested",
        message: `Extension requests ${manifest.permissions.length} permissions`,
        requirement: "Extensions should request minimal permissions",
        suggestion: "Review if all permissions are necessary",
      })
    }

    // Check for host permissions in Manifest V3
    if (manifest.manifest_version === 3 && manifest.permissions.some((p: string) => p.includes("://"))) {
      results.push({
        category: "permissions",
        type: "error",
        severity: "high",
        title: "Host permissions in wrong field",
        message: "Host permissions should be in host_permissions field in Manifest V3",
        requirement: "Manifest V3 permission structure",
        suggestion: "Move URL patterns to host_permissions field",
      })
    }
  }

  const validatePrivacyRequirements = async (manifest: any, results: StoreValidationResult[]) => {
    const collectsData = manifest.permissions?.some((p: string) =>
      STORE_REQUIREMENTS.privacy.data_collection_apis.includes(p),
    )

    if (collectsData && !manifest.privacy_policy) {
      results.push({
        category: "privacy",
        type: "error",
        severity: "critical",
        title: "Privacy policy required",
        message: "Extensions that collect user data must have a privacy policy",
        requirement: "Chrome Web Store privacy requirements",
        suggestion: "Add privacy policy URL to your developer dashboard",
      })
    }

    // Check for identity permission
    if (manifest.permissions?.includes("identity")) {
      results.push({
        category: "privacy",
        type: "info",
        severity: "medium",
        title: "Identity permission detected",
        message: "Extension can access user identity information",
        requirement: "Clearly explain why identity access is needed",
        suggestion: "Document identity usage in your privacy policy",
      })
    }

    // Check for cookies permission
    if (manifest.permissions?.includes("cookies")) {
      results.push({
        category: "privacy",
        type: "info",
        severity: "medium",
        title: "Cookie access detected",
        message: "Extension can access website cookies",
        requirement: "Explain cookie usage to users",
        suggestion: "Document cookie handling in your privacy policy",
      })
    }
  }

  const validateContentPolicies = async (manifest: any, files: File[], results: StoreValidationResult[]) => {
    // Check package size
    const totalSize = files.reduce((sum, file) => sum + file.size, 0)
    if (totalSize > STORE_REQUIREMENTS.content.max_package_size) {
      results.push({
        category: "content",
        type: "error",
        severity: "high",
        title: "Package too large",
        message: `Extension package is ${(totalSize / 1024 / 1024).toFixed(1)}MB`,
        requirement: "Chrome Web Store has a 128MB size limit",
        suggestion: "Reduce package size by optimizing assets",
      })
    }

    // Check for prohibited content keywords
    const textContent = [manifest.name, manifest.description].join(" ").toLowerCase()
    for (const prohibited of STORE_REQUIREMENTS.content.prohibited_content) {
      if (textContent.includes(prohibited)) {
        results.push({
          category: "content",
          type: "warning",
          severity: "high",
          title: "Potentially prohibited content",
          message: `Content may contain references to ${prohibited}`,
          requirement: "Chrome Web Store content policies",
          suggestion: "Review content policy compliance",
        })
      }
    }

    // Check for single purpose
    const hasMultiplePurposes =
      (manifest.content_scripts?.length > 0 ? 1 : 0) +
        (manifest.background ? 1 : 0) +
        (manifest.action || manifest.browser_action ? 1 : 0) +
        (manifest.options_page ? 1 : 0) >
      2

    if (hasMultiplePurposes) {
      results.push({
        category: "content",
        type: "info",
        severity: "low",
        title: "Multiple functionalities detected",
        message: "Extension has multiple types of functionality",
        requirement: "Chrome Web Store prefers single-purpose extensions",
        suggestion: "Ensure all features serve a cohesive purpose",
      })
    }
  }

  const calculateOverallScore = (results: StoreValidationResult[]) => {
    const weights = { critical: -25, high: -15, medium: -10, low: -5 }
    const penalties = results.reduce((sum, result) => sum + (weights[result.severity] || 0), 0)
    const score = Math.max(0, Math.min(100, 100 + penalties))
    setOverallScore(score)
  }

  const getResultIcon = (type: string) => {
    switch (type) {
      case "error":
        return <XCircle className="w-4 h-4 text-red-500" />
      case "warning":
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />
      case "success":
        return <CheckCircle className="w-4 h-4 text-green-500" />
      default:
        return <Shield className="w-4 h-4 text-blue-500" />
    }
  }

  const getResultColor = (type: string, severity: string) => {
    if (severity === "critical") return "border-red-300 bg-red-100"
    switch (type) {
      case "error":
        return "border-red-200 bg-red-50"
      case "warning":
        return "border-yellow-200 bg-yellow-50"
      case "success":
        return "border-green-200 bg-green-50"
      default:
        return "border-blue-200 bg-blue-50"
    }
  }

  const getSeverityBadge = (severity: string) => {
    const colors = {
      critical: "bg-red-500 text-white",
      high: "bg-orange-500 text-white",
      medium: "bg-yellow-500 text-white",
      low: "bg-blue-500 text-white",
    }
    return <Badge className={`text-xs ${colors[severity as keyof typeof colors]}`}>{severity.toUpperCase()}</Badge>
  }

  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-green-600"
    if (score >= 70) return "text-yellow-600"
    return "text-red-600"
  }

  const getScoreLabel = (score: number) => {
    if (score >= 90) return "Excellent"
    if (score >= 80) return "Good"
    if (score >= 70) return "Fair"
    if (score >= 60) return "Poor"
    return "Critical Issues"
  }

  const criticalIssues = validationResults.filter((r) => r.severity === "critical").length
  const errors = validationResults.filter((r) => r.type === "error").length
  const warnings = validationResults.filter((r) => r.type === "warning").length

  return (
    <Card className="border-retro-green/20 bg-retro-cream/50">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2 text-retro-green font-mono">
          <Shield className="w-5 h-5" />
          <span>Chrome Web Store Validator</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Upload Section */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragActive ? "border-retro-tan bg-retro-tan/10" : "border-retro-green/30 hover:border-retro-tan"
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <motion.div animate={dragActive ? { scale: 1.05 } : { scale: 1 }} className="space-y-3">
            <Upload className="w-12 h-12 mx-auto text-retro-green/50" />
            <div>
              <p className="text-retro-green font-mono">Drop extension files for Chrome Web Store validation</p>
              <p className="text-sm text-retro-green/60 font-mono">Include manifest.json and all referenced files</p>
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
          accept=".json,.js,.html,.css,.png,.jpg,.svg"
          onChange={(e) => {
            if (e.target.files) {
              const files = Array.from(e.target.files)
              const manifestFile = files.find((f) => f.name === "manifest.json")
              if (manifestFile) {
                manifestFile.text().then((content) => {
                  try {
                    const manifest = JSON.parse(content)
                    setExtensionData(manifest)
                    validateForStore(manifest, files)
                  } catch (error) {
                    toast({
                      title: "Invalid manifest",
                      description: "Could not parse manifest.json",
                      variant: "destructive",
                    })
                  }
                })
              }
            }
          }}
          className="hidden"
        />

        {/* Validation Progress */}
        {isValidating && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-mono text-retro-green">Validating for Chrome Web Store...</span>
              <span className="text-sm font-mono text-retro-green">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </motion.div>
        )}

        {/* Overall Score */}
        {overallScore > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-retro-green/20">
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <div className="space-y-2">
                    <div className={`text-4xl font-bold font-mono ${getScoreColor(overallScore)}`}>
                      {overallScore}/100
                    </div>
                    <div className={`text-lg font-mono ${getScoreColor(overallScore)}`}>
                      {getScoreLabel(overallScore)}
                    </div>
                  </div>
                  <div className="flex justify-center space-x-4">
                    {criticalIssues > 0 && (
                      <Badge variant="destructive" className="font-mono">
                        {criticalIssues} Critical
                      </Badge>
                    )}
                    {errors > 0 && (
                      <Badge variant="destructive" className="font-mono">
                        {errors} Errors
                      </Badge>
                    )}
                    {warnings > 0 && (
                      <Badge variant="secondary" className="font-mono bg-yellow-100 text-yellow-800">
                        {warnings} Warnings
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Validation Results */}
        <AnimatePresence>
          {validationResults.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <Tabs defaultValue="all" className="w-full">
                <TabsList className="grid w-full grid-cols-7">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="manifest">Manifest</TabsTrigger>
                  <TabsTrigger value="icons">Icons</TabsTrigger>
                  <TabsTrigger value="permissions">Permissions</TabsTrigger>
                  <TabsTrigger value="privacy">Privacy</TabsTrigger>
                  <TabsTrigger value="content">Content</TabsTrigger>
                  <TabsTrigger value="critical">Critical</TabsTrigger>
                </TabsList>

                <TabsContent value="all" className="space-y-2">
                  <ScrollArea className="h-96">
                    {validationResults.map((result, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className={`p-4 rounded-lg border mb-3 ${getResultColor(result.type, result.severity)}`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            {getResultIcon(result.type)}
                            <h4 className="font-mono font-semibold text-sm">{result.title}</h4>
                          </div>
                          <div className="flex items-center space-x-2">
                            {getSeverityBadge(result.severity)}
                            <Badge variant="outline" className="text-xs">
                              {result.category}
                            </Badge>
                          </div>
                        </div>
                        <p className="text-sm text-gray-700 mb-2">{result.message}</p>
                        <div className="text-xs text-gray-600 space-y-1">
                          <p>
                            <strong>Requirement:</strong> {result.requirement}
                          </p>
                          {result.suggestion && (
                            <p>
                              <strong>💡 Suggestion:</strong> {result.suggestion}
                            </p>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </ScrollArea>
                </TabsContent>

                {["manifest", "icons", "permissions", "privacy", "content"].map((category) => (
                  <TabsContent key={category} value={category} className="space-y-2">
                    <ScrollArea className="h-96">
                      {validationResults
                        .filter((r) => r.category === category)
                        .map((result, index) => (
                          <motion.div
                            key={index}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className={`p-4 rounded-lg border mb-3 ${getResultColor(result.type, result.severity)}`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center space-x-2">
                                {getResultIcon(result.type)}
                                <h4 className="font-mono font-semibold text-sm">{result.title}</h4>
                              </div>
                              {getSeverityBadge(result.severity)}
                            </div>
                            <p className="text-sm text-gray-700 mb-2">{result.message}</p>
                            <div className="text-xs text-gray-600 space-y-1">
                              <p>
                                <strong>Requirement:</strong> {result.requirement}
                              </p>
                              {result.suggestion && (
                                <p>
                                  <strong>💡 Suggestion:</strong> {result.suggestion}
                                </p>
                              )}
                            </div>
                          </motion.div>
                        ))}
                    </ScrollArea>
                  </TabsContent>
                ))}

                <TabsContent value="critical" className="space-y-2">
                  <ScrollArea className="h-96">
                    {validationResults
                      .filter((r) => r.severity === "critical" || r.type === "error")
                      .map((result, index) => (
                        <Alert key={index} className="mb-3 border-red-300 bg-red-50">
                          <XCircle className="w-4 h-4 text-red-500" />
                          <AlertDescription>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <h4 className="font-mono font-semibold text-sm">{result.title}</h4>
                                {getSeverityBadge(result.severity)}
                              </div>
                              <p className="text-sm">{result.message}</p>
                              {result.suggestion && <p className="text-xs text-blue-600">💡 {result.suggestion}</p>}
                            </div>
                          </AlertDescription>
                        </Alert>
                      ))}
                    {validationResults.filter((r) => r.severity === "critical" || r.type === "error").length === 0 && (
                      <div className="text-center py-8">
                        <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-2" />
                        <p className="text-sm font-mono text-retro-green">No critical issues found!</p>
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Store Readiness Summary */}
        {validationResults.length > 0 && (
          <Card className="border-retro-green/20">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-retro-green font-mono">
                <Star className="w-5 h-5" />
                <span>Store Readiness Summary</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-retro-green font-mono">{100 - criticalIssues * 10}%</div>
                  <div className="text-sm text-retro-green/70 font-mono">Compliance Score</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-retro-green font-mono">
                    {validationResults.filter((r) => r.type === "success").length}
                  </div>
                  <div className="text-sm text-retro-green/70 font-mono">Requirements Met</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-retro-green font-mono">
                    {Math.max(0, 7 - criticalIssues - errors)}
                  </div>
                  <div className="text-sm text-retro-green/70 font-mono">Days to Review</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="bg-retro-beige/30 rounded-lg p-3">
          <p className="text-xs font-mono text-retro-green/70">
            💡 This validator checks Chrome Web Store requirements including manifest structure, icons, permissions,
            privacy policies, and content guidelines.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
