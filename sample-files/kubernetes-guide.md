# Kubernetes Deployment Guide

## Pod Configuration
Pods are the smallest deployable units in Kubernetes. Each pod contains one or more containers that share storage and network resources.

## Services and Networking
ClusterIP, NodePort, and LoadBalancer services expose pods to internal and external traffic. Ingress controllers manage HTTP routing.

## Scaling
Horizontal Pod Autoscaler adjusts replica count based on CPU/memory metrics. Vertical Pod Autoscaler adjusts resource requests.
