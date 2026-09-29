# Reconnect an established private route

[Operator design](../operator-design.md) owns the permission and private-access
contract. This action uses the existing Pi request, queue and execution evidence.

```mermaid
flowchart TD
  Closed[Current private route is closed] --> Eligible{Established route matches attached host and allowed port?}
  Eligible -- No --> Review[Prepare ordinary Pi review request; keep existing draft]
  Eligible -- Yes --> Send[Submit scoped request to actual Main operator; keep draft]
  Send --> Accepted{Acceptance known?}
  Accepted -- Unavailable --> Keep[Send nothing; preserve composer]
  Accepted -- Unknown --> Retry[Keep same request key; explicit retry or review]
  Accepted -- Yes --> Queue[Existing Pi queue and conversation]
  Queue --> Capture[Resolve exact route version, URL, ports and host]
  Capture --> Permission[Existing permission and execution recorder]
  Permission -- Decline or stop --> Evidence[Record result; no replay]
  Permission -- Allowed --> Validate{Route and host still match?}
  Validate -- No --> Evidence
  Validate -- Yes --> SSH[Open or reuse pinned SSH on exact saved loopback port]
  SSH -- Failure --> Evidence
  SSH -- Open --> HTTP[Controller HTTP check of saved URL]
  HTTP --> Evidence
  Evidence --> Show[Destination progress and Main operator link]
  Show --> Observe[Existing route-bound access observation]
  Observe -- Tunnel open --> Open[Ordinary Open link; owner chooses when to open]
```

The tool's saved-route arguments are `accessRecordId` and `expectedUpdatedAt`,
mutually exclusive with explicit `remotePort`/`localPort` setup. Its approval
shows the resolved public host metadata, URL and ports. Private connection paths
stay inside the tool. Revalidation rejects changed credentials as well as a
changed address; an occupied local port fails rather than selecting another.

The HTTP status and check time describe what this controller observed, not
application health or remote-device usability. Missing responses do not authorize
repairs. Investigation, service restarts, exposure changes and publishing need
separate owner requests. Controller restart and a return from the owner's actual
remote device remain the next acceptance increment.
